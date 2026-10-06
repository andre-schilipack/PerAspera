import type { MoveDamageKind, MoveTargetScope, MoveTemplate } from '../../types/combat.ts';
import { resolveStrikeDamage } from '../../autobattle/damageResolution.ts';
import type { MeleeResolveResult } from '../../combatResolution.ts';
import { resolveMoveTemplateStrike } from '../../autobattle/autoplayStrike.ts';
import { COMBAT_TICK_SECONDS } from '../io/combatClock.ts';
import { decideAlgo } from '../ai/algoPolicy.ts';
import { decideAutoplay, isSkillActionable } from '../ai/autoplayPolicy.ts';
import type { PolicyDecision } from '../ai/policy.ts';
import { getMoveTemplate } from '../../../content/catalogs/moves.ts';
import { listAxialInDisk, parseHexKey } from '../../hex.ts';

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

/** Slice 9: avoid scanning all units when enumerating enemies/allies. */
type LivingByTeam = Record<TeamId, Set<UnitId>>;

function initLivingByTeam(unitsById: Record<UnitId, UnitState>): LivingByTeam {
  const livingByTeam: LivingByTeam = {};
  for (const u of Object.values(unitsById)) {
    if (!u.alive || u.retreated) continue;
    if (!livingByTeam[u.teamId]) livingByTeam[u.teamId] = new Set();
    livingByTeam[u.teamId]!.add(u.unitId);
  }
  return livingByTeam;
}

function removeLivingUnit(
  livingByTeam: LivingByTeam,
  teamId: TeamId,
  unitId: UnitId,
): void {
  livingByTeam[teamId]?.delete(unitId);
}

function livingTeamIds(livingByTeam: LivingByTeam): TeamId[] {
  return Object.keys(livingByTeam)
    .filter((tid) => (livingByTeam[tid]?.size ?? 0) > 0)
    .sort((a, b) => a.localeCompare(b));
}

function compareQueue(a: QueueItem, b: QueueItem): number {
  if (a.nextActAt !== b.nextActAt) return a.nextActAt - b.nextActAt;
  return a.unitId.localeCompare(b.unitId);
}

function baseDelayFromSpeed(speed: number): number {
  const s = Number.isFinite(speed) ? Math.max(0.1, speed) : 1;
  // Higher speed => smaller delay. Tick scale for UI: 1 tick = 0.1s (combatClock).
  return Math.max(1, Math.floor(10 / s));
}

/** Fight-time seconds → ticks. 1s = 10 ticks at `COMBAT_TICK_SECONDS` (0.1s). */
function ticksForFightSeconds(seconds: number): number {
  const whole = Math.max(0, Math.floor(seconds));
  const ticksPerSecond = Math.round(1 / COMBAT_TICK_SECONDS);
  return whole * ticksPerSecond;
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

function retreatParams(input: BattleInput): {
  retreatHpFraction: number;
  retreatChance: number;
  permadeathChance: number;
} {
  const retreatHpFractionRaw = input.retreatHpFraction ?? 0.25;
  const retreatChanceRaw = input.retreatChance ?? 0.35;
  const permadeathChanceRaw = input.permadeathChance ?? 0.05;
  return {
    retreatHpFraction: Math.min(1, Math.max(0, retreatHpFractionRaw)),
    retreatChance: Math.min(1, Math.max(0, retreatChanceRaw)),
    permadeathChance: Math.min(1, Math.max(0, permadeathChanceRaw)),
  };
}

function nearestEnemyId(
  state: BattleState,
  actor: UnitState,
  livingByTeam: LivingByTeam,
): UnitId | null {
  let best: { id: UnitId; dist: number; hp: number } | null = null;
  for (const [teamId, ids] of Object.entries(livingByTeam)) {
    if (teamId === actor.teamId) continue;
    for (const id of ids) {
      const u = state.unitsById[id];
      if (!u || !u.alive || u.retreated) continue;
      const dist = softHexGrid.distance(actor.tileId, u.tileId);
      if (!Number.isFinite(dist)) continue;
      const cand = { id: u.unitId, dist, hp: u.hp };
      if (!best) {
        best = cand;
        continue;
      }
      if (
        cand.dist < best.dist ||
        (cand.dist === best.dist &&
          (cand.hp < best.hp || (cand.hp === best.hp && cand.id < best.id)))
      ) {
        best = cand;
      }
    }
  }
  return best?.id ?? null;
}

function algoCanCast(params: {
  actor: UnitState;
  target: UnitState;
  pickedSkill: MoveTemplate | null;
  skillRange: number;
  isRanged: boolean;
  isAdjacent: boolean;
  inRange: boolean;
  hasEnemyInSkillRange: boolean;
  damageScope: MoveTargetScope;
}): boolean {
  const { pickedSkill, actor, target } = params;
  if (!pickedSkill) return false;
  if (pickedSkill.effect.kind === 'selfBuff') return target.unitId === actor.unitId;
  if (pickedSkill.effect.kind === 'heal') {
    if (target.teamId !== actor.teamId) return false;
    const dist = softHexGrid.distance(actor.tileId, target.tileId);
    return Number.isFinite(dist) && dist <= params.skillRange;
  }
  return params.damageScope === 'single'
    ? params.isAdjacent || (params.isRanged && params.inRange)
    : params.hasEnemyInSkillRange;
}

function skillRangeFromTemplate(template: MoveTemplate, isRangedMove: boolean): number {
  const raw = template.range;
  if (typeof raw === 'number') return Math.max(1, Math.floor(raw));
  return isRangedMove ? 3 : 1;
}

function enemiesInSkillRange(
  state: BattleState,
  actor: UnitState,
  range: number,
  livingByTeam: LivingByTeam,
): UnitState[] {
  const out: UnitState[] = [];
  for (const [teamId, ids] of Object.entries(livingByTeam)) {
    if (teamId === actor.teamId) continue;
    for (const id of ids) {
      const u = state.unitsById[id];
      if (!u || !u.alive || u.retreated) continue;
      const dist = softHexGrid.distance(actor.tileId, u.tileId);
      if (Number.isFinite(dist) && dist <= range) out.push(u);
    }
  }
  out.sort((a, b) => a.unitId.localeCompare(b.unitId));
  return out;
}

function nearestEnemyInSkillRange(
  state: BattleState,
  actor: UnitState,
  range: number,
  livingByTeam: LivingByTeam,
): UnitState | null {
  let best: UnitState | null = null;
  let bestKey: { dist: number; hp: number; id: UnitId } | null = null;
  for (const [teamId, ids] of Object.entries(livingByTeam)) {
    if (teamId === actor.teamId) continue;
    for (const id of ids) {
      const u = state.unitsById[id];
      if (!u || !u.alive || u.retreated) continue;
      const dist = softHexGrid.distance(actor.tileId, u.tileId);
      if (!Number.isFinite(dist) || dist > range) continue;
      const cand = { dist, hp: u.hp, id: u.unitId };
      if (
        !bestKey ||
        cand.dist < bestKey.dist ||
        (cand.dist === bestKey.dist &&
          (cand.hp < bestKey.hp || (cand.hp === bestKey.hp && cand.id < bestKey.id)))
      ) {
        best = u;
        bestKey = cand;
      }
    }
  }
  return best;
}

/** Slice 8: multi-target cluster — primary hex + neighbors; max N targets (stable order). */
const MULTI_CLUSTER_MAX = 3;

function clusterEnemyTargetsFromPrimary(
  primary: UnitState,
  state: BattleState,
  actorTeamId: TeamId,
  livingByTeam: LivingByTeam,
): UnitState[] {
  const tileSet = new Set<string>([primary.tileId, ...softHexGrid.neighbors(primary.tileId)]);
  const candidates: UnitState[] = [];
  for (const [teamId, ids] of Object.entries(livingByTeam)) {
    if (teamId === actorTeamId) continue;
    for (const id of ids) {
      const u = state.unitsById[id];
      if (!u || !u.alive || u.retreated) continue;
      if (tileSet.has(u.tileId)) candidates.push(u);
    }
  }
  candidates.sort((a, b) => a.unitId.localeCompare(b.unitId));
  return candidates.slice(0, MULTI_CLUSTER_MAX);
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
    immobile: spec.immobile === true,
    vital: spec.vital === true,
    algoProgram: spec.algoProgram,
  };
}

function isValidTileId(tileId: string): boolean {
  if (!tileId) return false;
  return parseHexKey(tileId) !== null;
}

function placeUnitsByRole(params: {
  units: UnitState[];
  obstacles: ReadonlySet<string>;
}): void {
  const { units, obstacles } = params;

  // Group by team, stable order.
  const byTeam = new Map<string, UnitState[]>();
  for (const u of units) {
    const arr = byTeam.get(u.teamId) ?? [];
    arr.push(u);
    byTeam.set(u.teamId, arr);
  }

  const teams = [...byTeam.keys()].sort((a, b) => a.localeCompare(b));
  const defaultAnchors = ['0,0', '0,6', '0,-6', '6,0', '-6,0'];

  const globallyOccupied = new Set<string>();

  for (let ti = 0; ti < teams.length; ti++) {
    const teamId = teams[ti]!;
    const teamUnits = (byTeam.get(teamId) ?? []).sort((a, b) =>
      a.unitId.localeCompare(b.unitId),
    );

    // Pick anchor: first valid tileId among team, else default.
    const anchor =
      teamUnits.find((u) => isValidTileId(u.tileId))?.tileId ??
      defaultAnchors[ti] ??
      '0,0';
    const anchorCoord = parseHexKey(anchor) ?? { q: 0, r: 0 };

    // Order by role: frontline, ranged, support.
    const roleRank = (r: string) =>
      r === 'frontline' ? 0 : r === 'ranged' ? 1 : 2;
    teamUnits.sort(
      (a, b) =>
        roleRank(a.role) - roleRank(b.role) || a.unitId.localeCompare(b.unitId),
    );

    for (const u of teamUnits) {
      // If already valid and not colliding/blocked, keep it.
      const ok =
        isValidTileId(u.tileId) &&
        !obstacles.has(u.tileId) &&
        !globallyOccupied.has(u.tileId);
      if (ok) {
        globallyOccupied.add(u.tileId);
        continue;
      }

      const desired =
        u.role === 'frontline' ? 1 : u.role === 'ranged' ? 2 : 3;

      // Search expanding rings starting at desired radius.
      let placed: string | null = null;
      for (let radius = desired; radius <= desired + 4; radius++) {
        const disk = listAxialInDisk(radius)
          .map((d) => ({ q: anchorCoord.q + d.q, r: anchorCoord.r + d.r }))
          .map((c) => `${c.q},${c.r}`);
        // Filter exact ring first (distance == radius).
        const ring = disk.filter(
          (tid) => softHexGrid.distance(anchor, tid) === radius,
        );
        const candidates = (ring.length > 0 ? ring : disk).filter(
          (tid) => !obstacles.has(tid) && !globallyOccupied.has(tid),
        );
        candidates.sort((a, b) => a.localeCompare(b));
        if (candidates.length > 0) {
          placed = candidates[0]!;
          break;
        }
      }

      // Fallback to anchor if everything is blocked (should be rare).
      u.tileId = placed ?? anchor;
      globallyOccupied.add(u.tileId);
    }
  }
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

function decayLivingByTicks(
  state: BattleState,
  deltaTicks: number,
  livingByTeam: LivingByTeam,
): void {
  if (deltaTicks <= 0) return;
  for (const ids of Object.values(livingByTeam)) {
    for (const id of ids) {
      const u = state.unitsById[id];
      if (!u || !u.alive || u.retreated) continue;
      u.cooldowns = decrementRecordByTicks(u.cooldowns, deltaTicks);
      u.statuses = decrementRecordByTicks(u.statuses, deltaTicks);
    }
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

function mostWoundedAllyId(
  state: BattleState,
  actor: UnitState,
  livingByTeam: LivingByTeam,
): UnitId | null {
  const allyIds = livingByTeam[actor.teamId];
  if (!allyIds) return null;
  let best: { id: UnitId; frac: number } | null = null;
  for (const id of allyIds) {
    const u = state.unitsById[id];
    if (!u || !u.alive || u.retreated) continue;
    const frac = u.maxHp > 0 ? u.hp / u.maxHp : 0;
    if (frac >= 1) continue;
    const cand = { id: u.unitId, frac };
    if (!best || cand.frac < best.frac || (cand.frac === best.frac && cand.id < best.id)) {
      best = cand;
    }
  }
  return best?.id ?? null;
}

export function simulateBattle(input: BattleInput): BattleResult {
  const rng = input.randomSource ?? Math.random;
  const maxTicks = Math.max(1, Math.floor(input.maxTicks));
  const getSkillTemplate = input.getSkillTemplate ?? getMoveTemplate;
  const obstacles = input.obstacles ?? new Set<string>();
  const retreatCfg = retreatParams(input);

  const writer = createCanonicalEventWriter();
  writer.advanceToTick(input.startTick ?? 0);

  const unitsById: Record<UnitId, UnitState> = {};
  for (const spec of input.units) {
    unitsById[spec.unitId] = initUnitState(spec);
  }

  // Slice 7: auto-placement by role. If a unit's tileId is empty/invalid/colliding/blocked,
  // the engine chooses a valid tile around a per-team anchor.
  placeUnitsByRole({
    units: Object.values(unitsById),
    obstacles,
  });

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

  const livingByTeam = initLivingByTeam(unitsById);

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
  /** Team that lost because a vital anchor died. */
  let anchorLoser: TeamId | null = null;
  const noteVitalDeath = (unit: UnitState) => {
    if (unit.vital && !unit.alive) anchorLoser = unit.teamId;
  };

  while (ticksElapsed < maxTicks && !anchorLoser) {
    const teams = livingTeamIds(livingByTeam);
    if (teams.length <= 1) break;

    const next = queue.pop();
    if (!next) break;

    const actor = state.unitsById[next.unitId];
    if (!actor || !actor.alive || actor.retreated) continue;

    // Advance time to the actor's scheduled tick.
    writer.advanceToTick(next.nextActAt);
    state.tick = writer.currentTick;
    ticksElapsed = Math.max(ticksElapsed, state.tick);
    decayLivingByTicks(state, Math.max(0, state.tick - lastTick), livingByTeam);
    lastTick = state.tick;

    let decision: PolicyDecision;
    if (actor.algoProgram) {
      decision = decideAlgo({
        actor,
        program: actor.algoProgram,
        state,
        livingByTeam,
        getSkillTemplate,
      });
    } else {
      const nearestId = nearestEnemyId(state, actor, livingByTeam);
      if (!nearestId) {
        // No enemies (should be handled by teams check), but be safe.
        break;
      }
      decision = decideAutoplay({
        actor,
        state,
        nearestEnemyId: nearestId,
        livingByTeam,
        rng,
        getSkillTemplate,
        retreatHpFraction: retreatCfg.retreatHpFraction,
        retreatChance: retreatCfg.retreatChance,
      });
    }

    if (decision.kind === 'retreat') {
      actor.retreated = true;
      occupied.delete(actor.tileId);
      removeLivingUnit(livingByTeam, actor.teamId, actor.unitId);
      writer.push({
        type: 'unit_acted',
        unitId: actor.unitId,
        action: 'retreat',
      });
      writer.push({
        type: 'unit_retreated',
        unitId: actor.unitId,
        reason: actor.algoProgram
          ? 'algo'
          : `hp<=${String(retreatCfg.retreatHpFraction)}`,
      });

      // Do not reschedule a retreated unit.
      continue;
    }

    const decidedTarget =
      decision.kind === 'use' ? state.unitsById[decision.targetId] : undefined;
    const target =
      decidedTarget && decidedTarget.alive && !decidedTarget.retreated
        ? decidedTarget
        : null;

    if (decision.kind === 'wait' || !target) {
      writer.push({
        type: 'unit_acted',
        unitId: actor.unitId,
        action: 'wait',
      });
    } else {
    const rawSkill =
      decision.skillId.length > 0 ? getSkillTemplate(decision.skillId) : undefined;
    const pickedSkill =
      rawSkill && isSkillActionable(actor, rawSkill) ? rawSkill : null;

    const isAdjacent = softHexGrid.isAdjacent(actor.tileId, target.tileId);
    const canMelee = isAdjacent;
    const isRanged = pickedSkill?.tags.includes('ranged') ?? false;
    const skillRange = pickedSkill
      ? skillRangeFromTemplate(pickedSkill, isRanged)
      : 1;
    const inRange = softHexGrid.distance(actor.tileId, target.tileId) <= skillRange;

    const damageScope: MoveTargetScope =
      pickedSkill?.effect.kind === 'damage' ? pickedSkill.targets : 'single';
    const hasEnemyInSkillRange =
      enemiesInSkillRange(state, actor, skillRange, livingByTeam).length > 0;
    const canCastSkill = actor.algoProgram
      ? algoCanCast({
          actor,
          target,
          pickedSkill,
          skillRange,
          isRanged,
          isAdjacent,
          inRange,
          hasEnemyInSkillRange,
          damageScope,
        })
      : !!pickedSkill &&
        (pickedSkill.effect.kind !== 'damage' || damageScope === 'single'
          ? canMelee || (isRanged && inRange)
          : hasEnemyInSkillRange);

    if (pickedSkill && canCastSkill) {
      // Spend mana + apply cooldown.
      const manaCost = Math.max(0, Math.floor(pickedSkill.cost ?? 0));
      actor.mana = Math.max(0, actor.mana - manaCost);
      const cd = Math.max(0, Math.floor(pickedSkill.cooldownSeconds ?? 0));
      if (cd > 0) actor.cooldowns[pickedSkill.id] = ticksForFightSeconds(cd);

      const castFocus =
        pickedSkill.effect.kind === 'damage' && damageScope !== 'single'
          ? nearestEnemyInSkillRange(state, actor, skillRange, livingByTeam) ?? target
          : target;

      writer.push({
        type: 'unit_acted',
        unitId: actor.unitId,
        action: 'cast',
        targetId: castFocus.unitId,
        skillId: pickedSkill.id,
      });

      if (pickedSkill.effect.kind === 'damage') {
        let dmgTargets: UnitState[];
        if (damageScope === 'all') {
          dmgTargets = enemiesInSkillRange(state, actor, skillRange, livingByTeam);
        } else if (damageScope === 'multi') {
          const primary = nearestEnemyInSkillRange(
            state,
            actor,
            skillRange,
            livingByTeam,
          );
          dmgTargets = primary
            ? clusterEnemyTargetsFromPrimary(primary, state, actor.teamId, livingByTeam)
            : [];
        } else {
          dmgTargets = [target];
        }

        for (const hitTarget of dmgTargets) {
          const hit = resolveMoveTemplateStrike({
            template: pickedSkill,
            attackerAttributes: actor.attributes,
            defenderReceivingStrike: hitTarget.attributes,
            rng,
          });
          writer.push({
            type: 'damage_dealt',
            sourceId: actor.unitId,
            targetId: hitTarget.unitId,
            amount: hit.finalDamage,
            damageKind: pickedSkill.damageKind,
            flags: {
              dodged: hit.flags.dodged || undefined,
              blocked: hit.flags.blocked || undefined,
            },
          });
          stats.byUnit[actor.unitId]!.damageDealt += hit.finalDamage;
          stats.byUnit[hitTarget.unitId]!.damageTaken += hit.finalDamage;
          if (!hit.flags.dodged && hit.finalDamage > 0) {
            hitTarget.hp = Math.max(0, hitTarget.hp - hit.finalDamage);
            hitTarget.alive = hitTarget.hp > 0;
          }
        }

        for (const hitTarget of dmgTargets) {
          if (!hitTarget.alive) {
            const permadeath =
              !hitTarget.retreated && rng() < retreatCfg.permadeathChance;
            writer.push({
              type: 'unit_died',
              unitId: hitTarget.unitId,
              sourceId: actor.unitId,
              permadeath,
            });
            stats.byUnit[actor.unitId]!.kills += 1;
            occupied.delete(hitTarget.tileId);
            removeLivingUnit(livingByTeam, hitTarget.teamId, hitTarget.unitId);
            noteVitalDeath(hitTarget);
          }
        }
      } else if (pickedSkill.effect.kind === 'heal') {
        const allyId = actor.algoProgram
          ? target.teamId === actor.teamId
            ? target.unitId
            : null
          : mostWoundedAllyId(state, actor, livingByTeam);
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
        const dur = Math.max(1, Math.floor(pickedSkill.durationSeconds ?? 1));
        actor.statuses[pickedSkill.effect.statusId] = ticksForFightSeconds(dur);
        writer.push({
          type: 'status_applied',
          sourceId: actor.unitId,
          targetId: actor.unitId,
          statusId: pickedSkill.effect.statusId,
          turns: dur,
        });
      }
    } else if (!canMelee && actor.immobile) {
      writer.push({
        type: 'unit_acted',
        unitId: actor.unitId,
        action: 'wait',
      });
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
        occupied.add(actor.tileId);
        writer.push({
          type: 'unit_acted',
          unitId: actor.unitId,
          action: 'wait',
        });
      }
    } else if (actor.algoProgram && target.teamId === actor.teamId) {
      writer.push({
        type: 'unit_acted',
        unitId: actor.unitId,
        action: 'wait',
      });
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
        const permadeath =
          !target.retreated && rng() < retreatCfg.permadeathChance;
        writer.push({
          type: 'unit_died',
          unitId: target.unitId,
          sourceId: actor.unitId,
          permadeath,
        });
        stats.byUnit[actor.unitId]!.kills += 1;
        occupied.delete(target.tileId);
        removeLivingUnit(livingByTeam, target.teamId, target.unitId);
        noteVitalDeath(target);
      }
    }
    }

    if (anchorLoser) break;

    // Reschedule actor.
    actor.nextActAt = state.tick + baseDelayFromSpeed(actor.speed);
    queue.push({ nextActAt: actor.nextActAt, unitId: actor.unitId });
  }

  const teamsLeft = livingTeamIds(livingByTeam);
  const winningTeamId = anchorLoser
    ? (Object.keys(state.unitsById)
        .map((id) => state.unitsById[id]!.teamId)
        .find((teamId) => teamId !== anchorLoser) ?? null)
    : teamsLeft.length === 1
      ? teamsLeft[0]!
      : null;
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

