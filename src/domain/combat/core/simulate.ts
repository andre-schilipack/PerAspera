import type { MoveDamageKind, MoveTemplate } from '../../types/combat.ts';
import { resolveStrikeDamage } from '../../autobattle/damageResolution.ts';
import type { MeleeResolveResult } from '../../combatResolution.ts';
import { combatBeatPhaseFromTurns } from '../../autobattle/combatBeatPhase.ts';
import {
  pickAutoplayMoveTemplate,
  resolveMoveTemplateStrike,
} from '../../autobattle/autoplayStrike.ts';
import { getMoveTemplate } from '../../../content/catalogs/moves.ts';

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

function pickGreedyStep(params: {
  from: string;
  to: string;
  obstacles: ReadonlySet<string>;
  occupied: ReadonlySet<string>;
  avoidTile?: string;
}): string | null {
  const { from, to, obstacles, occupied, avoidTile } = params;
  const neighbors = softHexGrid.neighbors(from);
  if (neighbors.length === 0) return null;
  const candidates = neighbors
    .filter((n) => !obstacles.has(n) && !occupied.has(n))
    .filter((n) => (avoidTile ? n !== avoidTile : true))
    .map((n) => ({ n, d: softHexGrid.distance(n, to) }))
    .filter((c) => Number.isFinite(c.d));
  candidates.sort((a, b) => a.d - b.d || a.n.localeCompare(b.n));
  const best = candidates[0];
  if (!best) return null;
  // Only move if it improves distance.
  const curD = softHexGrid.distance(from, to);
  return best.d < curD ? best.n : null;
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
  const skillIds = spec.skillIds ?? [];
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
    skillIds,
    cooldowns: {},
    statuses: {},
    speed,
    alive: hp > 0,
    retreated: false,
    nextActAt: 0,
  };
}

function decrementRecordByTicks(
  record: Record<string, number>,
  deltaTicks: number,
): Record<string, number> {
  if (deltaTicks <= 0) return record;
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(record)) {
    const rem = Math.max(0, Math.floor(v) - deltaTicks);
    if (rem > 0) next[k] = rem;
  }
  return next;
}

function decayAllByTicks(state: BattleState, deltaTicks: number): void {
  if (deltaTicks <= 0) return;
  for (const u of Object.values(state.unitsById)) {
    if (!u.alive || u.retreated) continue;
    u.cooldowns = decrementRecordByTicks(u.cooldowns, deltaTicks);
    u.statuses = decrementRecordByTicks(u.statuses, deltaTicks);
  }
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

function averageEnemyHpFraction(state: BattleState, actor: UnitState): number {
  let sum = 0;
  let count = 0;
  for (const u of Object.values(state.unitsById)) {
    if (!u.alive || u.retreated) continue;
    if (u.teamId === actor.teamId) continue;
    sum += u.maxHp > 0 ? u.hp / u.maxHp : 0;
    count++;
  }
  return count > 0 ? sum / count : 1;
}

function mostWoundedAllyId(state: BattleState, actor: UnitState): UnitId | null {
  let best: { id: UnitId; frac: number } | null = null;
  for (const u of Object.values(state.unitsById)) {
    if (!u.alive || u.retreated) continue;
    if (u.teamId !== actor.teamId) continue;
    const frac = u.maxHp > 0 ? u.hp / u.maxHp : 0;
    if (frac >= 1) continue;
    const cand = { id: u.unitId, frac };
    if (!best || cand.frac < best.frac || (cand.frac === best.frac && cand.id < best.id)) {
      best = cand;
    }
  }
  return best?.id ?? null;
}

function isSkillActionable(actor: UnitState, template: MoveTemplate): boolean {
  const cd = actor.cooldowns[template.id] ?? 0;
  if (cd > 0) return false;
  const manaCost = Math.max(0, Math.floor(template.cost ?? 0));
  if (actor.mana < manaCost) return false;
  return true;
}

function pickSkillTemplate(params: {
  actor: UnitState;
  state: BattleState;
  rng: () => number;
  getSkillTemplate: (id: string) => MoveTemplate | undefined;
}): MoveTemplate | null {
  const { actor, state, rng, getSkillTemplate } = params;
  const available = actor.skillIds.filter((id) => {
    const t = getSkillTemplate(id);
    return t ? isSkillActionable(actor, t) : false;
  });
  if (available.length === 0) return null;
  const beat = combatBeatPhaseFromTurns({
    turn: Math.max(1, state.tick + 1),
    attackerHpFraction: actor.maxHp > 0 ? actor.hp / actor.maxHp : 0,
    defenderHpFraction: averageEnemyHpFraction(state, actor),
  });
  return pickAutoplayMoveTemplate(
    available,
    getSkillTemplate,
    actor.attributes,
    { combatBeatPhase: beat, defenderHpFraction: averageEnemyHpFraction(state, actor), rng },
  );
}

export function simulateBattle(input: BattleInput): BattleResult {
  const rng = input.randomSource ?? Math.random;
  const maxTicks = Math.max(1, Math.floor(input.maxTicks));
  const getSkillTemplate = input.getSkillTemplate ?? getMoveTemplate;
  const obstacles = input.obstacles ?? new Set<string>();

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
  const occupied = new Set<string>();
  const lastTileByUnit = new Map<UnitId, string>();
  for (const u of Object.values(unitsById)) {
    if (!u.alive || u.retreated) continue;
    queue.push({ nextActAt: u.nextActAt, unitId: u.unitId });
    occupied.add(u.tileId);
    lastTileByUnit.set(u.unitId, u.tileId);
  }

  let ticksElapsed = 0;
  let lastTick = state.tick;
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
    decayAllByTicks(state, Math.max(0, state.tick - lastTick));
    lastTick = state.tick;

    const targetId = nearestEnemyId(state, actor);
    if (!targetId) {
      // No enemies (should be handled by teams check), but be safe.
      break;
    }
    const target = state.unitsById[targetId];
    if (!target || !target.alive || target.retreated) {
      continue;
    }

    const pickedSkill = pickSkillTemplate({
      actor,
      state,
      rng,
      getSkillTemplate,
    });

    const isAdjacent = softHexGrid.isAdjacent(actor.tileId, target.tileId);
    const canMelee = isAdjacent;
    const isRanged = pickedSkill?.tags.includes('ranged') ?? false;
    const skillRange =
      typeof (pickedSkill as any)?.range === 'number'
        ? Math.max(1, Math.floor((pickedSkill as any).range))
        : isRanged
          ? 3
          : 1;
    const inRange = softHexGrid.distance(actor.tileId, target.tileId) <= skillRange;

    if (pickedSkill && (canMelee || (isRanged && inRange))) {
      // Spend mana + apply cooldown.
      const manaCost = Math.max(0, Math.floor(pickedSkill.cost ?? 0));
      actor.mana = Math.max(0, actor.mana - manaCost);
      const cd = Math.max(0, Math.floor(pickedSkill.cooldownTurns ?? 0));
      if (cd > 0) actor.cooldowns[pickedSkill.id] = cd;

      writer.push({
        type: 'unit_acted',
        unitId: actor.unitId,
        action: 'cast',
        targetId: target.unitId,
        skillId: pickedSkill.id,
      });

      if (pickedSkill.effect.kind === 'damage') {
        const hit = resolveMoveTemplateStrike({
          template: pickedSkill,
          attackerAttributes: actor.attributes,
          defenderReceivingStrike: target.attributes,
          rng,
        });
        writer.push({
          type: 'damage_dealt',
          sourceId: actor.unitId,
          targetId: target.unitId,
          amount: hit.finalDamage,
          damageKind: pickedSkill.damageKind,
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
      } else if (pickedSkill.effect.kind === 'heal') {
        const allyId = mostWoundedAllyId(state, actor);
        if (allyId) {
          const ally = state.unitsById[allyId]!;
          const amount = Math.max(
            0,
            Math.floor(
              // Reuse the same power scaling path. (Healing uses computed power as magnitude.)
              // resolveMoveTemplateStrike is damage-specific (mitigation), so use template power directly via strike with dummy defender?
              // For Slice 3, reuse compute path indirectly: strike vs self with no dodge/block is not available here, so keep it simple.
              // We'll upgrade this in a future slice with a dedicated heal resolver.
              2 + actor.attributes.intelligence * 2 + actor.attributes.charisma * 2,
            ),
          );
          const before = ally.hp;
          ally.hp = Math.min(ally.maxHp, ally.hp + amount);
          const healed = ally.hp - before;
          writer.push({
            type: 'healed',
            sourceId: actor.unitId,
            targetId: ally.unitId,
            amount: healed,
          });
        }
      } else if (pickedSkill.effect.kind === 'selfBuff') {
        const dur = Math.max(1, Math.floor(pickedSkill.durationTurns ?? 1));
        actor.statuses[pickedSkill.effect.statusId] = dur;
        writer.push({
          type: 'status_applied',
          sourceId: actor.unitId,
          targetId: actor.unitId,
          statusId: pickedSkill.effect.statusId,
          turns: dur,
        });
      }
    } else if (!canMelee) {
      // Temporarily free actor's current tile so it can move.
      occupied.delete(actor.tileId);
      const avoid = lastTileByUnit.get(actor.unitId);
      const step = pickGreedyStep({
        from: actor.tileId,
        to: target.tileId,
        obstacles,
        occupied,
        avoidTile: avoid,
      });
      if (step) {
        const fromTileId = actor.tileId;
        actor.tileId = step;
        lastTileByUnit.set(actor.unitId, fromTileId);
        occupied.add(step);
        writer.push({
          type: 'unit_acted',
          unitId: actor.unitId,
          action: 'move',
          toTileId: step,
        });
        writer.push({
          type: 'unit_moved',
          unitId: actor.unitId,
          fromTileId,
          toTileId: step,
        });
      } else {
        // Put actor back on occupancy.
        occupied.add(actor.tileId);
        writer.push({
          type: 'unit_acted',
          unitId: actor.unitId,
          action: 'wait',
        });
      }
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

