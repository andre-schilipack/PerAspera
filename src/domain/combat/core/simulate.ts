import type { MoveDamageKind } from '../../types/combat.ts';
import { resolveStrikeDamage } from '../../autobattle/damageResolution.ts';
import type { MeleeResolveResult } from '../../combatResolution.ts';

import { MinHeap } from './heap.ts';
import {
  createCanonicalEventWriter,
  type TeamId,
  type UnitId,
} from './events.ts';
import type {
  BattleInput,
  BattleResult,
  BattleState,
  BattleStateSummary,
  BattleStatsSummary,
  UnitSpec,
  UnitState,
} from './types.ts';
import { softHexGrid } from '../grid/softHexGrid.ts';

type QueueItem = { nextActAt: number; unitId: UnitId };

function compareQueue(a: QueueItem, b: QueueItem): number {
  if (a.nextActAt !== b.nextActAt) return a.nextActAt - b.nextActAt;
  return a.unitId.localeCompare(b.unitId);
}

function baseDelayFromSpeed(speed: number): number {
  const s = Number.isFinite(speed) ? Math.max(0.1, speed) : 1;
  // Slice 1: keep it simple. Higher speed => smaller delay, but clamp.
  return Math.max(1, Math.floor(10 / s));
}

function livingTeams(unitsById: Record<UnitId, UnitState>): TeamId[] {
  const set = new Set<TeamId>();
  for (const u of Object.values(unitsById)) {
    if (u.alive && !u.retreated) set.add(u.teamId);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function nearestEnemyId(
  state: BattleState,
  actor: UnitState,
): UnitId | null {
  let best: { id: UnitId; dist: number; hp: number } | null = null;
  for (const u of Object.values(state.unitsById)) {
    if (!u.alive || u.retreated) continue;
    if (u.teamId === actor.teamId) continue;
    const dist = softHexGrid.distance(actor.tileId, u.tileId);
    if (!Number.isFinite(dist)) continue;
    const cand = { id: u.unitId, dist, hp: u.hp };
    if (!best) {
      best = cand;
      continue;
    }
    // Prefer nearest, then lowest HP, then stable id.
    if (
      cand.dist < best.dist ||
      (cand.dist === best.dist && (cand.hp < best.hp || (cand.hp === best.hp && cand.id < best.id)))
    ) {
      best = cand;
    }
  }
  return best?.id ?? null;
}

function initUnitState(spec: UnitSpec): UnitState {
  const maxHp = Math.max(1, Math.floor(spec.maxHp));
  const hp = Math.max(0, Math.min(maxHp, Math.floor(spec.hp ?? maxHp)));
  const maxMana = Math.max(0, Math.floor(spec.maxMana));
  const mana = Math.max(0, Math.min(maxMana, Math.floor(spec.mana ?? 0)));
  const speed = Number.isFinite(spec.speed) ? spec.speed : 1;
  return {
    unitId: spec.unitId,
    teamId: spec.teamId,
    role: spec.role,
    tileId: spec.tileId,
    attributes: spec.attributes,
    hp,
    maxHp,
    mana,
    maxMana,
    speed,
    alive: hp > 0,
    retreated: false,
    nextActAt: 0,
  };
}

function initStats(units: readonly UnitSpec[]): BattleStatsSummary {
  const byUnit: BattleStatsSummary['byUnit'] = {};
  for (const u of units) {
    byUnit[u.unitId] = { damageDealt: 0, damageTaken: 0, kills: 0 };
  }
  return { byUnit };
}

function buildSummary(
  state: BattleState,
  winningTeamId: TeamId | null,
  ticksElapsed: number,
): BattleStateSummary {
  const livingUnitsByTeam: Record<TeamId, number> = {};
  for (const u of Object.values(state.unitsById)) {
    if (!u.alive || u.retreated) continue;
    livingUnitsByTeam[u.teamId] = (livingUnitsByTeam[u.teamId] ?? 0) + 1;
  }
  return { winningTeamId, ticksElapsed, livingUnitsByTeam };
}

function resolveMeleeAttack(params: {
  attacker: UnitState;
  defender: UnitState;
  rng: () => number;
}): { damageKind: MoveDamageKind; hit: MeleeResolveResult } {
  const { attacker, defender, rng } = params;
  const raw = Math.max(1, Math.floor(4 + attacker.attributes.strength * 3));
  const damageKind: MoveDamageKind = 'physical';
  const hit = resolveStrikeDamage(raw, damageKind, defender.attributes, rng);
  return { damageKind, hit };
}

export function simulateBattle(input: BattleInput): BattleResult {
  const rng = input.randomSource ?? Math.random;
  const maxTicks = Math.max(1, Math.floor(input.maxTicks));

  const writer = createCanonicalEventWriter();
  writer.advanceToTick(input.startTick ?? 0);

  const unitsById: Record<UnitId, UnitState> = {};
  for (const spec of input.units) {
    unitsById[spec.unitId] = initUnitState(spec);
  }

  // Emit spawns in stable order.
  const spawnOrder = [...Object.values(unitsById)].sort((a, b) =>
    a.unitId.localeCompare(b.unitId),
  );
  for (const u of spawnOrder) {
    writer.push({
      type: 'unit_spawned',
      unitId: u.unitId,
      teamId: u.teamId,
      role: u.role,
      tileId: u.tileId,
      hp: u.hp,
      maxHp: u.maxHp,
      mana: u.mana,
      maxMana: u.maxMana,
    });
  }

  const state: BattleState = { tick: writer.currentTick, unitsById };
  const stats = initStats(input.units);

  const queue = new MinHeap<QueueItem>(compareQueue);
  for (const u of Object.values(unitsById)) {
    if (!u.alive || u.retreated) continue;
    queue.push({ nextActAt: u.nextActAt, unitId: u.unitId });
  }

  let ticksElapsed = 0;
  while (ticksElapsed < maxTicks) {
    const teams = livingTeams(state.unitsById);
    if (teams.length <= 1) break;

    const next = queue.pop();
    if (!next) break;

    const actor = state.unitsById[next.unitId];
    if (!actor || !actor.alive || actor.retreated) continue;

    // Advance time to the actor's scheduled tick.
    writer.advanceToTick(next.nextActAt);
    state.tick = writer.currentTick;
    ticksElapsed = Math.max(ticksElapsed, state.tick);

    const targetId = nearestEnemyId(state, actor);
    if (!targetId) {
      // No enemies (should be handled by teams check), but be safe.
      break;
    }
    const target = state.unitsById[targetId];
    if (!target || !target.alive || target.retreated) {
      continue;
    }

    const isAdjacent = softHexGrid.isAdjacent(actor.tileId, target.tileId);
    if (!isAdjacent) {
      writer.push({ type: 'unit_acted', unitId: actor.unitId, action: 'wait' });
    } else {
      writer.push({
        type: 'unit_acted',
        unitId: actor.unitId,
        action: 'attack',
        targetId: target.unitId,
      });

      const { damageKind, hit } = resolveMeleeAttack({
        attacker: actor,
        defender: target,
        rng,
      });

      writer.push({
        type: 'damage_dealt',
        sourceId: actor.unitId,
        targetId: target.unitId,
        amount: hit.finalDamage,
        damageKind,
        flags: {
          dodged: hit.flags.dodged || undefined,
          blocked: hit.flags.blocked || undefined,
        },
      });

      stats.byUnit[actor.unitId]!.damageDealt += hit.finalDamage;
      stats.byUnit[target.unitId]!.damageTaken += hit.finalDamage;

      if (!hit.flags.dodged && hit.finalDamage > 0) {
        target.hp = Math.max(0, target.hp - hit.finalDamage);
        target.alive = target.hp > 0;
      }

      if (!target.alive) {
        writer.push({
          type: 'unit_died',
          unitId: target.unitId,
          sourceId: actor.unitId,
          permadeath: false,
        });
        stats.byUnit[actor.unitId]!.kills += 1;
      }
    }

    // Reschedule actor.
    actor.nextActAt = state.tick + baseDelayFromSpeed(actor.speed);
    queue.push({ nextActAt: actor.nextActAt, unitId: actor.unitId });
  }

  const teamsLeft = livingTeams(state.unitsById);
  const winningTeamId = teamsLeft.length === 1 ? teamsLeft[0]! : null;
  if (winningTeamId) {
    writer.push({ type: 'battle_ended', winningTeamId });
  }

  return {
    schemaVersion: 1,
    battleId: input.battleId,
    canonicalEvents: writer.events,
    finalState: buildSummary(state, winningTeamId, ticksElapsed),
    summary: stats,
  };
}

