import {
  ALLY_SPIRIT_DEFENDER_HIT,
  ALLY_SPIRIT_INITIAL,
  ALLY_SPIRIT_PER_KILL,
  ALLY_SPIRIT_STRUCTURE_HIT,
  ALLY_SPIRIT_SUPPORT_CONNECT,
  CENTER_HEX_ID,
  DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
  DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
  DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
  DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
  DEFENSE_GUARD_DAMAGE_MAX,
  DEFENSE_GUARD_DAMAGE_MIN,
  DEFENSE_NPC_GUARD_IDS,
  DEFENSE_NPC_TOWER_LABEL,
  DEFENSE_RETREAT_HP_FRACTION,
  DEFENSE_TOWER_DAMAGE_MAX,
  DEFENSE_TOWER_DAMAGE_MIN,
  BASE_MELEE_BLOCK_CHANCE,
  BASE_MELEE_DODGE_CHANCE,
} from './constants.ts';
import {
  allySpiritOutgoingDamageMultiplier,
  clampAllySpirit,
  decrementMoraleShock,
  evaluateFrontGapSpiritDelta,
  maybeTriggerMoraleShock,
} from './defenseAllySpirit.ts';
import {
  DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES,
  resolveGuardDisparoStrike,
  resolveTowerRajadaStrike,
} from './defenseNpcMoves.ts';
import {
  computeRawPower,
  pickAutoplayMoveTemplate,
  resolveMoveTemplateStrike,
  resolveStrikeDamage,
  type AutoplaySkillPickContext,
} from './autobattle/index.ts';
import {
  applyDamageToEnemyAt,
  countLivingInBucket,
  defenderBucketForLineIndex,
  enemyBucketForSpawnIndex,
  livingEnemyCount,
  pickLivingEnemyIndexPreferBucket,
  resolveDefenderStrikeLineIndex,
  rollGuardTargetBucket,
  rollTowerTargetBucket,
} from './defenseTactics.ts';
import {
  resolveIncomingMeleeDamage,
  type MeleeResolveResult,
} from './combatResolution.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import {
  applyDamageToCityHallStructure,
  applyDamageToWallOnHexTile,
  ensureWallFeatureOnTile,
  patchHexInMap,
} from './encounterCombatWall.ts';
import type {
  CombatBeatPhase,
  CombatLogEntry,
  DefenseTacticalBucket,
  EnemyInstance,
  MoveTemplate,
  MoveTemplateId,
} from './types/combat.ts';
import type {
  DefenderCombatState,
  DefenderLineEntry,
  NightlyDefenseOutcome,
  NightlyDefensePhase,
} from './types/defense.ts';
import type { MassCombatWallSnapshot } from './types/massCombat.ts';
import type {
  AlliedStructure,
  EncounterSessionConfig,
} from './types/encounter.ts';
import type { HexMap } from './types/map.ts';
import type {
  EncounterCombatStateDelta,
  RunEncounterCombatRoundArgs,
} from './encounterCombatTypes.ts';
export type {
  CombatRoundContinuation,
  EncounterCombatStateDelta,
  RunEncounterCombatRoundArgs,
} from './encounterCombatTypes.ts';
import {
  lineAllySpiritShift,
  lineBucketPressureSnapshot,
  lineMoraleShockHits,
  lineSupportStabilizes,
} from '../content/defenseSpiritLines.ts';
import { getMoveTemplate } from '../content/catalogs/moves.ts';

/** @deprecated The encounter resolver uses {@link AlliedStructure} instead. */
export type EncounterCombatTheater = 'nightly_wall' | 'prefeitura_siege';

/** @deprecated Use {@link AlliedStructure} list. */
export type MassDefenseStructureMode = EncounterCombatTheater;

export interface EncounterCombatRoundResult {
  stateDelta: EncounterCombatStateDelta;
  wallResult: MassCombatWallSnapshot;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
  /** Set when the map is mutated (wall and/or city hall structural HP). */
  hexMap?: HexMap;
}

/** @deprecated Use {@link EncounterCombatRoundResult}. */
export type MassDefenseCombatRoundResult = EncounterCombatRoundResult;

export type StructuralEncounterKind = 'wall' | 'city_hall' | 'none';

function structuralKindFromAllied(
  structures: readonly AlliedStructure[],
): StructuralEncounterKind {
  if (structures.some((s) => s.type === 'city_hall')) {
    return 'city_hall';
  }
  if (structures.some((s) => s.type === 'wall')) {
    return 'wall';
  }
  return 'none';
}

function wallHexIdFrom(
  structures: readonly AlliedStructure[],
  fallback: string,
): string {
  const w = structures.find((s) => s.type === 'wall');
  return w?.type === 'wall' ? w.hexId : fallback;
}

function cityHallHexIdFrom(
  structures: readonly AlliedStructure[],
  centerHexId: string = CENTER_HEX_ID,
): string {
  const c = structures.find((s) => s.type === 'city_hall');
  return c?.type === 'city_hall' ? c.hexId : centerHexId;
}

/**
 * `noRetreat: true` = last stand (no line fallback). Omitted: defaults to `true` when a
 * `city_hall` structure is present, else `false` (perimeter with retreat).
 */
function resolveNoRetreat(
  alliedStructures: readonly AlliedStructure[],
  sessionConfig: EncounterSessionConfig | undefined,
): boolean {
  if (sessionConfig?.noRetreat !== undefined) {
    return sessionConfig.noRetreat;
  }
  return alliedStructures.some((s) => s.type === 'city_hall');
}

/** @deprecated Use {@link RunEncounterCombatRoundArgs} with `alliedStructures` + `sessionConfig`. */
export type RunMassDefenseCombatRoundArgs = RunEncounterCombatRoundArgs;

function cloneHexMapForRound(map: HexMap): HexMap {
  const hexes: HexMap['hexes'] = {};
  for (const [id, h] of Object.entries(map.hexes)) {
    hexes[id] = {
      ...h,
      placeSlots: [...h.placeSlots],
      features: h.features ? [...h.features] : undefined,
    };
  }
  return { ...map, hexes };
}

function rollIntInclusive(
  rng: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function averageLivingHostileHpFraction(
  enemies: readonly EnemyInstance[],
): number {
  const living = enemies.filter((e) => e.currentHealth > 0);
  if (living.length === 0) return 1;
  let sum = 0;
  for (const e of living) {
    sum += e.maxHealth > 0 ? e.currentHealth / e.maxHealth : 0;
  }
  return sum / living.length;
}

function averageDefenderLineHpFraction(
  line: readonly DefenderLineEntry[],
  noRetreat: boolean,
): number {
  const active = line.filter((d) => {
    if (!noRetreat) {
      return !d.retreated && d.currentHp > 0;
    }
    return d.currentHp > 0;
  });
  if (active.length === 0) return 1;
  let sum = 0;
  for (const d of active) {
    sum += d.maxHp > 0 ? d.currentHp / d.maxHp : 0;
  }
  return sum / active.length;
}

function normalizeCombatState(
  state: DefenderLineEntry['combatState'],
): DefenderCombatState {
  return {
    cooldowns: { ...(state?.cooldowns ?? {}) },
    statuses: { ...(state?.statuses ?? {}) },
  };
}

function decrementPositiveRecord(
  record: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, turns] of Object.entries(record)) {
    const remaining = Math.max(0, Math.floor(turns) - 1);
    if (remaining > 0) next[id] = remaining;
  }
  return next;
}

function decrementDefenderCombatState(def: DefenderLineEntry): DefenderLineEntry {
  const state = normalizeCombatState(def.combatState);
  return {
    ...def,
    combatState: {
      cooldowns: decrementPositiveRecord(state.cooldowns),
      statuses: decrementPositiveRecord(state.statuses),
    },
  };
}

function statusTurns(def: DefenderLineEntry, statusId: string): number {
  return def.combatState?.statuses[statusId] ?? 0;
}

function moveCooldownTurns(def: DefenderLineEntry, moveId: MoveTemplateId): number {
  return def.combatState?.cooldowns[moveId] ?? 0;
}

function isMoveActionable(
  template: MoveTemplate,
  def: DefenderLineEntry,
  defenderLine: readonly DefenderLineEntry[],
): boolean {
  if (moveCooldownTurns(def, template.id) > 0) return false;
  if (template.effect.kind === 'heal') {
    return defenderLine.some((d) => d.currentHp > 0 && d.currentHp < d.maxHp);
  }
  if (template.effect.kind === 'selfBuff') {
    return statusTurns(def, template.effect.statusId) <= 0;
  }
  return true;
}

function availableSkillIdsForDefender(
  def: DefenderLineEntry,
  defenderLine: readonly DefenderLineEntry[],
): MoveTemplateId[] {
  const skillIds = def.skillIds ?? [];
  const out: MoveTemplateId[] = [];
  for (const id of skillIds) {
    const template = getMoveTemplate(id);
    if (template && isMoveActionable(template, def, defenderLine)) {
      out.push(id);
    }
  }
  return out;
}

function putMoveOnCooldown(
  def: DefenderLineEntry,
  move: MoveTemplate,
): DefenderLineEntry {
  const cd = move.cooldownTurns ?? 0;
  if (cd <= 0) return def;
  const state = normalizeCombatState(def.combatState);
  return {
    ...def,
    combatState: {
      ...state,
      cooldowns: { ...state.cooldowns, [move.id]: cd },
    },
  };
}

function applySelfBuff(def: DefenderLineEntry, move: MoveTemplate): DefenderLineEntry {
  if (move.effect.kind !== 'selfBuff') return def;
  const duration = move.durationTurns ?? 1;
  const state = normalizeCombatState(def.combatState);
  return {
    ...def,
    combatState: {
      ...state,
      statuses: {
        ...state.statuses,
        [move.effect.statusId]: Math.max(1, duration),
      },
    },
  };
}

function updateDefenderAt(
  line: DefenderLineEntry[],
  index: number,
  nextDef: DefenderLineEntry,
): DefenderLineEntry[] {
  const next = [...line];
  next[index] = nextDef;
  return next;
}

function incomingDefenseOptionsFor(def: DefenderLineEntry): {
  dodgeChance?: number;
  blockChance?: number;
} {
  const dodgeBonus = statusTurns(def, 'be_like_water') > 0 ? 0.35 : 0;
  const blockBonus = statusTurns(def, 'defensive_stance') > 0 ? 0.5 : 0;
  return {
    dodgeChance: Math.min(0.75, BASE_MELEE_DODGE_CHANCE + dodgeBonus),
    blockChance: Math.min(0.75, BASE_MELEE_BLOCK_CHANCE + blockBonus),
  };
}

function firstLivingEnemyIndex(enemies: readonly EnemyInstance[]): number {
  return enemies.findIndex((e) => e.currentHealth > 0);
}

function livingEnemyIndicesPreferBucket(
  enemies: readonly EnemyInstance[],
  bucket: DefenseTacticalBucket,
): number[] {
  const living = enemies
    .map((e, i) => (e.currentHealth > 0 ? i : -1))
    .filter((i): i is number => i >= 0);
  const preferred = living.filter(
    (i) => (enemies[i]!.tacticalBucket ?? 'front') === bucket,
  );
  return [...preferred, ...living.filter((i) => !preferred.includes(i))];
}

function targetIndicesForMove(
  move: MoveTemplate,
  enemies: readonly EnemyInstance[],
  prefBucket: DefenseTacticalBucket,
  rng: () => number,
): number[] {
  if (move.targets === 'single') {
    const hitIdx = pickLivingEnemyIndexPreferBucket(enemies, prefBucket, rng);
    return hitIdx >= 0 ? [hitIdx] : [];
  }
  if (move.targets === 'all') {
    return enemies
      .map((e, i) => (e.currentHealth > 0 ? i : -1))
      .filter((i): i is number => i >= 0);
  }
  return livingEnemyIndicesPreferBucket(enemies, prefBucket).slice(0, 2);
}

/**
 * Beat phase + hostile HP fraction for autoplay scoring ({@link pickAutoplaySkill}).
 * `defenderHpFraction`: pool health of opposing force (hostiles here).
 */
export function massDefenseSkillPickContext(
  turn: number,
  noRetreat: boolean,
  enemies: readonly EnemyInstance[],
  defenderLine: readonly DefenderLineEntry[],
  rng: () => number,
): AutoplaySkillPickContext {
  const hostileFrac = averageLivingHostileHpFraction(enemies);
  const allyFrac = averageDefenderLineHpFraction(defenderLine, noRetreat);
  let combatBeatPhase: CombatBeatPhase = 'contact';
  if (hostileFrac <= 0.28 || allyFrac <= 0.32) {
    combatBeatPhase = 'endgame';
  } else if (turn <= 3 && hostileFrac >= 0.72) {
    combatBeatPhase = 'approach';
  }
  return {
    combatBeatPhase,
    defenderHpFraction: hostileFrac,
    rng,
  };
}

function formatDefenderStrikePlayerLog(params: {
  def: DefenderLineEntry;
  prefBucket: string;
  hit: MeleeResolveResult;
  supportBoost: boolean;
  /** When false, allow "support net" flavoured copy (perimeter). */
  noRetreat: boolean;
  move?: MoveTemplate;
}): string {
  const { def, prefBucket, hit, supportBoost, noRetreat, move } = params;
  const perimeterCopy = !noRetreat;
  if (hit.flags.dodged) {
    if (move) {
      return perimeterCopy
        ? `${def.name}'s ${move.name} is evaded${supportBoost ? ' (support net).' : '.'}`
        : `${def.name}'s ${move.name} is evaded.`;
    }
    return perimeterCopy
      ? `${def.name}'s strike is evaded${supportBoost ? ' (support net).' : '.'}`
      : `${def.name}'s strike is evaded.`;
  }
  if (move) {
    if (hit.flags.blocked) {
      return `${def.name} (${prefBucket}) — ${move.name} (blocked): ${String(hit.finalDamage)} damage.`;
    }
    return `${def.name} (${prefBucket}) — ${move.name}: ${String(hit.finalDamage)} damage.`;
  }
  if (hit.flags.blocked) {
    return `${def.name} (${prefBucket}) (blocked): ${String(hit.finalDamage)} damage.`;
  }
  return `${def.name} (${prefBucket}) hits for ${String(hit.finalDamage)} damage.`;
}

function normalizeEnemies(list: readonly EnemyInstance[]): EnemyInstance[] {
  return list.map((e, i) => ({
    ...e,
    tacticalBucket: e.tacticalBucket ?? enemyBucketForSpawnIndex(i),
  }));
}

function applyRetreatRules(entry: DefenderLineEntry): DefenderLineEntry {
  const threshold = Math.ceil(entry.maxHp * DEFENSE_RETREAT_HP_FRACTION);
  if (entry.currentHp <= threshold && entry.currentHp > 0) {
    return { ...entry, retreated: true };
  }
  return entry;
}

/**
 * Strike order: each living defender in line order, then the wall (repeats by modulo).
 */
function buildNightlyWallStrikeCycle(
  defenderLine: DefenderLineEntry[],
): Array<{ kind: 'defender'; lineIndex: number } | { kind: 'wall' }> {
  const cycle: Array<
    { kind: 'defender'; lineIndex: number } | { kind: 'wall' }
  > = [];
  for (let i = 0; i < defenderLine.length; i++) {
    const d = defenderLine[i]!;
    if (!d.retreated && d.currentHp > 0) {
      cycle.push({ kind: 'defender', lineIndex: i });
    }
  }
  cycle.push({ kind: 'wall' });
  return cycle;
}

/** Living defenders in line order, then the Prefeitura (last stand). */
function buildPrefeituraSiegeStrikeCycle(
  defenderLine: DefenderLineEntry[],
): Array<
  { kind: 'defender'; lineIndex: number } | { kind: 'prefeitura' }
> {
  const cycle: Array<
    { kind: 'defender'; lineIndex: number } | { kind: 'prefeitura' }
  > = [];
  for (let i = 0; i < defenderLine.length; i++) {
    const d = defenderLine[i]!;
    if (d.currentHp > 0) {
      cycle.push({ kind: 'defender', lineIndex: i });
    }
  }
  cycle.push({ kind: 'prefeitura' });
  return cycle;
}

/** Hostile phase: only living defenders as targets (no structural slot). */
function buildDefenderOnlyStrikeCycle(
  defenderLine: DefenderLineEntry[],
  noRetreat: boolean,
): Array<{ kind: 'defender'; lineIndex: number }> {
  const cycle: Array<{ kind: 'defender'; lineIndex: number }> = [];
  for (let i = 0; i < defenderLine.length; i++) {
    const d = defenderLine[i]!;
    const active = noRetreat ? d.currentHp > 0 : !d.retreated && d.currentHp > 0;
    if (active) {
      cycle.push({ kind: 'defender', lineIndex: i });
    }
  }
  return cycle;
}

/**
 * Single source for nightly wall + Prefeitura siege combat rounds (tower, guards,
 * defender melee, enemy strikes, ally spirit, outcomes).
 *
 * Session fields (`DailyDefenseState`) are merged in the game layer; use
 * `CombatRoundContinuation` in {@link advanceEncounterCombatRound} from `./encounterCombat.ts`
 * and {@link applyEncounterCombatRoundToDaily} from `./encounterCombatSessionMerge.ts`.
 */
export function runEncounterCombatRound(
  args: RunEncounterCombatRoundArgs,
): EncounterCombatRoundResult {
  const {
    hexMap: inputHexMap,
    rng,
    enemies: inputEnemies,
    defenderLine: initialDefenderLine,
    alliedStructures,
    sessionConfig,
    continuation,
  } = args;

  const sk = structuralKindFromAllied(alliedStructures);
  const noRetreat = resolveNoRetreat(alliedStructures, sessionConfig);
  const wallHexId = wallHexIdFrom(
    alliedStructures,
    continuation.wallHexFallback ?? '',
  );
  const cityHallHexId = cityHallHexIdFrom(alliedStructures, CENTER_HEX_ID);

  const turn = continuation.currentTurn + 1;
  const t0 = Date.now();
  const lines: Omit<CombatLogEntry, 'id'>[] = [];
  let enemies = normalizeEnemies(inputEnemies);
  let defenderLine = initialDefenderLine.map(decrementDefenderCombatState);
  let breached = false;

  let workingHexMap = cloneHexMapForRound(inputHexMap);
  let prefeituraCollapsed = false;

  let allySpirit = clampAllySpirit(
    continuation.allySpirit ?? ALLY_SPIRIT_INITIAL,
  );
  let moraleShockTurnsRemaining = decrementMoraleShock(
    continuation.moraleShockTurnsRemaining ?? 0,
  );

  const spiritBeforeRound = allySpirit;
  let killsThisRound = 0;
  let defenderHitsThisRound = 0;
  let structureHitsThisRound = 0;

  const roundTitle =
    sk === 'city_hall'
      ? `— Prefeitura siege round ${String(turn)} —`
      : sk === 'wall'
        ? `— Nightly defense round ${String(turn)} —`
        : `— Defense round ${String(turn)} —`;

  lines.push({
    turn,
    timestamp: t0,
    text: roundTitle,
    type: 'system',
  });

  lines.push({
    turn,
    timestamp: t0,
    text: lineBucketPressureSnapshot({
      front: countLivingInBucket(enemies, 'front'),
      ranged: countLivingInBucket(enemies, 'ranged'),
      support: countLivingInBucket(enemies, 'support'),
    }),
    type: 'system',
  });

  const outgoingMul = allySpiritOutgoingDamageMultiplier(
    moraleShockTurnsRemaining,
  );

  const towerRaw = rollIntInclusive(
    rng,
    DEFENSE_TOWER_DAMAGE_MIN,
    DEFENSE_TOWER_DAMAGE_MAX,
  );
  const towerBucket = rollTowerTargetBucket(rng);
  const towerIdx = pickLivingEnemyIndexPreferBucket(enemies, towerBucket, rng);
  const towerHit = resolveTowerRajadaStrike(towerRaw, rng);
  const towerBefore = livingEnemyCount(enemies);
  if (towerIdx >= 0) {
    enemies = applyDamageToEnemyAt(enemies, towerIdx, towerHit.finalDamage);
    killsThisRound += Math.max(0, towerBefore - livingEnemyCount(enemies));
  }
  lines.push({
    turn,
    timestamp: t0,
    text: towerHit.flags.dodged
      ? `${DEFENSE_NPC_TOWER_LABEL}: shot evaded by hostiles.`
      : `${DEFENSE_NPC_TOWER_LABEL} fires (${towerBucket}) for ${String(towerHit.finalDamage)} damage.`,
    type: 'guarda',
  });

  for (let gi = 0; gi < DEFENSE_NPC_GUARD_IDS.length; gi++) {
    const graw = rollIntInclusive(
      rng,
      DEFENSE_GUARD_DAMAGE_MIN,
      DEFENSE_GUARD_DAMAGE_MAX,
    );
    const grBucket = rollGuardTargetBucket(rng);
    const gIdx = pickLivingEnemyIndexPreferBucket(enemies, grBucket, rng);
    const gh = resolveGuardDisparoStrike(graw, rng);
    const gBefore = livingEnemyCount(enemies);
    if (gIdx >= 0) {
      enemies = applyDamageToEnemyAt(enemies, gIdx, gh.finalDamage);
      killsThisRound += Math.max(0, gBefore - livingEnemyCount(enemies));
    }
    lines.push({
      turn,
      timestamp: t0,
      text: gh.flags.dodged
        ? `Rifle guard: burst evaded.`
        : `Rifle guard fires (${grBucket}) for ${String(gh.finalDamage)} damage.`,
      type: 'guarda',
    });
  }

  const skipDefender = (def: DefenderLineEntry): boolean => {
    if (!noRetreat) {
      return def.retreated || def.currentHp <= 0;
    }
    return def.currentHp <= 0;
  };

  for (let lineIndex = 0; lineIndex < defenderLine.length; lineIndex++) {
    const def = defenderLine[lineIndex]!;
    if (skipDefender(def)) continue;
    if (firstLivingEnemyIndex(enemies) < 0) break;

    const prefBucket = def.tacticalBucket ?? 'front';
    const useSkillAutoplay =
      def.coreAttributes !== undefined &&
      def.skillIds !== undefined &&
      def.skillIds.length > 0;

    let actingDef = def;

    if (useSkillAutoplay) {
      const skillCtx = massDefenseSkillPickContext(
        turn,
        noRetreat,
        enemies,
        defenderLine,
        rng,
      );
      const availableSkillIds = availableSkillIdsForDefender(def, defenderLine);
      const template = pickAutoplayMoveTemplate(
        availableSkillIds,
        getMoveTemplate,
        def.coreAttributes!,
        skillCtx,
      );

      if (template.effect.kind === 'heal') {
        const healTargetIndex = defenderLine.reduce((best, candidate, i) => {
          if (candidate.currentHp <= 0 || candidate.currentHp >= candidate.maxHp) {
            return best;
          }
          if (best < 0) return i;
          const bestDef = defenderLine[best]!;
          const candidateFrac = candidate.currentHp / candidate.maxHp;
          const bestFrac = bestDef.currentHp / bestDef.maxHp;
          return candidateFrac < bestFrac ? i : best;
        }, -1);
        const healAmount = computeRawPower(template, def.coreAttributes!);
        if (healTargetIndex >= 0) {
          const target = defenderLine[healTargetIndex]!;
          const nextHp = Math.min(target.maxHp, target.currentHp + healAmount);
          defenderLine = updateDefenderAt(defenderLine, healTargetIndex, {
            ...target,
            currentHp: nextHp,
          });
          lines.push({
            turn,
            timestamp: t0,
            text: `${def.name} — ${template.name}: heals ${target.name} for ${String(nextHp - target.currentHp)} HP.`,
            type: 'player',
          });
        } else {
          lines.push({
            turn,
            timestamp: t0,
            text: `${def.name} — ${template.name}: no wounded ally to heal.`,
            type: 'player',
          });
        }
        actingDef = putMoveOnCooldown(defenderLine[lineIndex] ?? def, template);
        defenderLine = updateDefenderAt(defenderLine, lineIndex, actingDef);
        continue;
      }

      if (template.effect.kind === 'selfBuff') {
        actingDef = applySelfBuff(def, template);
        actingDef = putMoveOnCooldown(actingDef, template);
        defenderLine = updateDefenderAt(defenderLine, lineIndex, actingDef);
        lines.push({
          turn,
          timestamp: t0,
          text: `${def.name} — ${template.name}: ${template.effect.label} for ${String(template.durationTurns ?? 1)} turns.`,
          type: 'player',
        });
        continue;
      }

      let supportBoost = false;
      let strikePowerMultiplier = outgoingMul;
      if (statusTurns(def, 'concentration') > 0 && template.tags.includes('ranged')) {
        strikePowerMultiplier *= 1.35;
      }
      if (def.tacticalBucket === 'support' && rng() < 0.38) {
        allySpirit = clampAllySpirit(allySpirit + ALLY_SPIRIT_SUPPORT_CONNECT);
        supportBoost = true;
        strikePowerMultiplier *= 0.72;
        lines.push({
          turn,
          timestamp: t0,
          text: lineSupportStabilizes(),
          type: 'system',
          highlight: true,
        });
      }

      const targetIndices = targetIndicesForMove(template, enemies, prefBucket, rng);
      const beforeHits = livingEnemyCount(enemies);
      let totalDamage = 0;
      let firstHit: MeleeResolveResult | null = null;
      for (const hitIdx of targetIndices) {
        const hit = resolveMoveTemplateStrike({
          template,
          attackerAttributes: def.coreAttributes!,
          defenderReceivingStrike: DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES,
          rng,
          strikePowerMultiplier,
        });
        firstHit ??= hit;
        totalDamage += hit.finalDamage;
        enemies = applyDamageToEnemyAt(enemies, hitIdx, hit.finalDamage);
      }
      killsThisRound += Math.max(0, beforeHits - livingEnemyCount(enemies));
      actingDef = putMoveOnCooldown(def, template);
      defenderLine = updateDefenderAt(defenderLine, lineIndex, actingDef);
      lines.push({
        turn,
        timestamp: t0,
        text:
          template.targets === 'single' && firstHit
            ? formatDefenderStrikePlayerLog({
                def,
                prefBucket,
                hit: firstHit,
                supportBoost,
                noRetreat,
                move: template,
              })
            : `${def.name} (${prefBucket}) — ${template.name}: ${String(totalDamage)} total damage to ${String(targetIndices.length)} targets.`,
        type: 'player',
      });
    } else {
      let supportBoost = false;
      let raw = rollIntInclusive(rng, 5, 12);
      raw = Math.max(1, Math.floor(raw * outgoingMul));

      if (def.tacticalBucket === 'support' && rng() < 0.38) {
        allySpirit = clampAllySpirit(allySpirit + ALLY_SPIRIT_SUPPORT_CONNECT);
        supportBoost = true;
        raw = Math.max(1, Math.floor(raw * 0.72));
        lines.push({
          turn,
          timestamp: t0,
          text: lineSupportStabilizes(),
          type: 'system',
          highlight: true,
        });
      }

      const hit =
        def.coreAttributes !== undefined
          ? resolveStrikeDamage(
              raw,
              'physical',
              DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES,
              rng,
            )
          : resolveIncomingMeleeDamage(raw, rng);

      const hitIdx = pickLivingEnemyIndexPreferBucket(enemies, prefBucket, rng);
      const beforeHits = livingEnemyCount(enemies);
      if (hitIdx >= 0) {
        enemies = applyDamageToEnemyAt(enemies, hitIdx, hit.finalDamage);
        killsThisRound += Math.max(0, beforeHits - livingEnemyCount(enemies));
      }

      lines.push({
        turn,
        timestamp: t0,
        text: formatDefenderStrikePlayerLog({
          def,
          prefBucket,
          hit,
          supportBoost,
          noRetreat,
        }),
        type: 'player',
      });
    }
  }

  enemies = enemies.filter((e) => e.currentHealth > 0);

  allySpirit = clampAllySpirit(
    allySpirit + killsThisRound * ALLY_SPIRIT_PER_KILL,
  );
  allySpirit = clampAllySpirit(
    allySpirit + evaluateFrontGapSpiritDelta(enemies),
  );

  const hitWallSection = (): void => {
    structureHitsThisRound += 1;
    const raw = rollIntInclusive(
      rng,
      DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
      DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
    );
    const tile = workingHexMap.hexes[wallHexId];
    if (!tile) {
      breached = true;
    } else {
      const prepared = ensureWallFeatureOnTile(tile);
      const { tile: nextTile, breached: b } = applyDamageToWallOnHexTile(
        prepared,
        raw,
      );
      workingHexMap = patchHexInMap(workingHexMap, wallHexId, () => nextTile);
      breached = b;
    }
    lines.push({
      turn,
      timestamp: t0,
      text: `Hostiles strike the sector wall for ${String(raw)} structural damage.`,
      type: 'enemy',
    });
  };

  if (sk === 'wall') {
    const strikeCycle = buildNightlyWallStrikeCycle(defenderLine);

    for (let ei = 0; ei < enemies.length; ei++) {
      const e = enemies[ei]!;
      if (breached) break;
      const slot = strikeCycle[ei % strikeCycle.length]!;

      if (slot.kind === 'wall') {
        hitWallSection();
        continue;
      }

      const di = resolveDefenderStrikeLineIndex(e, defenderLine, slot.lineIndex);
      const d = defenderLine[di]!;
      if (d.retreated || d.currentHp <= 0) {
        lines.push({
          turn,
          timestamp: t0,
          text: `${e.enemyId} aims at ${d.name}'s position — line down; pressure on the wall.`,
          type: 'enemy',
        });
        hitWallSection();
        continue;
      }

      const rawMelee = rollIntInclusive(
        rng,
        DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
        DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
      );
      const strike = resolveIncomingMeleeDamage(
        rawMelee,
        rng,
        incomingDefenseOptionsFor(d),
      );
      const nextHp = strike.flags.dodged
        ? d.currentHp
        : Math.max(0, d.currentHp - strike.finalDamage);
      if (!strike.flags.dodged && strike.finalDamage > 0) {
        defenderHitsThisRound += 1;
      }
      let nextD: DefenderLineEntry = { ...d, currentHp: nextHp };
      if (!noRetreat) {
        nextD = applyRetreatRules(nextD);
      }
      const rep = [...defenderLine];
      rep[di] = nextD;
      defenderLine = rep;
      lines.push({
        turn,
        timestamp: t0,
        text: strike.flags.dodged
          ? `${e.enemyId} lunges at ${d.name} — evaded.`
          : strike.flags.blocked
            ? `${e.enemyId} hits ${d.name} (blocked) for ${String(strike.finalDamage)}.`
            : `${e.enemyId} (${e.tacticalBucket ?? 'front'}) hits ${d.name} for ${String(strike.finalDamage)}.`,
        type: 'enemy',
      });
    }
  } else if (sk === 'city_hall') {
    const strikeCycle = buildPrefeituraSiegeStrikeCycle(defenderLine);

    for (let ei = 0; ei < enemies.length && !prefeituraCollapsed; ei++) {
      const e = enemies[ei]!;
      const slot = strikeCycle[ei % strikeCycle.length]!;

      if (slot.kind === 'prefeitura') {
        structureHitsThisRound += 1;
        const rawStruct = rollIntInclusive(
          rng,
          DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
          DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
        );
        const hitPref = applyDamageToCityHallStructure(
          workingHexMap,
          cityHallHexId,
          rawStruct,
        );
        workingHexMap = hitPref.hexMap;
        lines.push({
          turn,
          timestamp: t0,
          text: `Hostiles strike the Prefeitura for ${String(rawStruct)} structural damage.`,
          type: 'enemy',
        });
        if (hitPref.collapsed) {
          prefeituraCollapsed = true;
          lines.push({
            turn,
            timestamp: t0,
            text: 'The Prefeitura has fallen.',
            type: 'system',
            highlight: true,
          });
          break;
        }
        continue;
      }

      const di = resolveDefenderStrikeLineIndex(e, defenderLine, slot.lineIndex);
      const d = defenderLine[di]!;
      if (d.currentHp <= 0) {
        structureHitsThisRound += 1;
        const rawFallback = rollIntInclusive(
          rng,
          DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
          DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
        );
        const hitFallback = applyDamageToCityHallStructure(
          workingHexMap,
          cityHallHexId,
          rawFallback,
        );
        workingHexMap = hitFallback.hexMap;
        lines.push({
          turn,
          timestamp: t0,
          text: `${e.enemyId} pressures the line — strike hits the Prefeitura for ${String(rawFallback)} structural damage.`,
          type: 'enemy',
        });
        if (hitFallback.collapsed) {
          prefeituraCollapsed = true;
          lines.push({
            turn,
            timestamp: t0,
            text: 'The Prefeitura has fallen.',
            type: 'system',
            highlight: true,
          });
        }
        continue;
      }

      const rawMelee = rollIntInclusive(
        rng,
        DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
        DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
      );
      const strike = resolveIncomingMeleeDamage(
        rawMelee,
        rng,
        incomingDefenseOptionsFor(d),
      );
      const nextHp = strike.flags.dodged
        ? d.currentHp
        : Math.max(0, d.currentHp - strike.finalDamage);
      if (!strike.flags.dodged && strike.finalDamage > 0) {
        defenderHitsThisRound += 1;
      }
      const nextD: DefenderLineEntry = { ...d, currentHp: nextHp };
      const rep = [...defenderLine];
      rep[di] = nextD;
      defenderLine = rep;
      lines.push({
        turn,
        timestamp: t0,
        text: strike.flags.dodged
          ? `${e.enemyId} lunges at ${d.name} — evaded.`
          : strike.flags.blocked
            ? `${e.enemyId} hits ${d.name} (blocked) for ${String(strike.finalDamage)}.`
            : `${e.enemyId} (${e.tacticalBucket ?? 'front'}) hits ${d.name} for ${String(strike.finalDamage)}.`,
        type: 'enemy',
      });
    }
  } else {
    const strikeCycle = buildDefenderOnlyStrikeCycle(defenderLine, noRetreat);
    for (let ei = 0; ei < enemies.length; ei++) {
      const e = enemies[ei]!;
      if (strikeCycle.length === 0) {
        lines.push({
          turn,
          timestamp: t0,
          text: `${e.enemyId} roams — no defender line in contact.`,
          type: 'enemy',
        });
        continue;
      }
      const slot = strikeCycle[ei % strikeCycle.length]!;
      const di = resolveDefenderStrikeLineIndex(
        e,
        defenderLine,
        slot.lineIndex,
      );
      const d = defenderLine[di]!;
      if (d.currentHp <= 0) {
        lines.push({
          turn,
          timestamp: t0,
          text: `${e.enemyId} finds no open stance in the line.`,
          type: 'enemy',
        });
        continue;
      }
      const rawMelee = rollIntInclusive(
        rng,
        DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
        DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
      );
      const strike = resolveIncomingMeleeDamage(
        rawMelee,
        rng,
        incomingDefenseOptionsFor(d),
      );
      const nextHp = strike.flags.dodged
        ? d.currentHp
        : Math.max(0, d.currentHp - strike.finalDamage);
      if (!strike.flags.dodged && strike.finalDamage > 0) {
        defenderHitsThisRound += 1;
      }
      let nextD: DefenderLineEntry = { ...d, currentHp: nextHp };
      if (!noRetreat) {
        nextD = applyRetreatRules(nextD);
      }
      const rep = [...defenderLine];
      rep[di] = nextD;
      defenderLine = rep;
      lines.push({
        turn,
        timestamp: t0,
        text: strike.flags.dodged
          ? `${e.enemyId} lunges at ${d.name} — evaded.`
          : strike.flags.blocked
            ? `${e.enemyId} hits ${d.name} (blocked) for ${String(strike.finalDamage)}.`
            : `${e.enemyId} (${e.tacticalBucket ?? 'front'}) hits ${d.name} for ${String(strike.finalDamage)}.`,
        type: 'enemy',
      });
    }
  }

  allySpirit = clampAllySpirit(
    allySpirit +
      defenderHitsThisRound * ALLY_SPIRIT_DEFENDER_HIT +
      structureHitsThisRound * ALLY_SPIRIT_STRUCTURE_HIT,
  );

  const shockRoll = maybeTriggerMoraleShock({
    allySpirit,
    moraleShockTurnsRemaining,
    rng,
    defenderHitsThisRound,
  });
  moraleShockTurnsRemaining = shockRoll.moraleShockTurnsRemaining;
  if (shockRoll.triggered) {
    lines.push({
      turn,
      timestamp: t0,
      text: lineMoraleShockHits(),
      type: 'system',
      highlight: true,
    });
  }

  const spiritDelta = allySpirit - spiritBeforeRound;
  if (spiritDelta !== 0 || shockRoll.triggered) {
    lines.push({
      turn,
      timestamp: t0,
      text: lineAllySpiritShift(spiritDelta, allySpirit),
      type: 'system',
    });
  }

  const totalEnemyPoints = sumLivingThreatPoints(enemies);
  let outcome: NightlyDefenseOutcome = continuation.outcome;
  let isCompleted = false;
  let phase: NightlyDefensePhase = continuation.phase;

  if (sk === 'wall') {
    if (breached) {
      outcome = 'breach';
      isCompleted = true;
      phase = 'ended';
      lines.push({
        turn,
        timestamp: t0,
        text: 'The wall gives — city breach!',
        type: 'system',
        highlight: true,
      });
    } else if (enemies.length === 0) {
      outcome = 'victory';
      isCompleted = true;
      phase = 'ended';
      lines.push({
        turn,
        timestamp: t0,
        text: 'Hostiles routed — perimeter holds.',
        type: 'system',
        highlight: true,
      });
    }
  } else if (sk === 'city_hall') {
    if (prefeituraCollapsed) {
      outcome = 'loss';
      isCompleted = true;
      phase = 'ended';
    } else if (enemies.length === 0) {
      outcome = 'victory';
      isCompleted = true;
      phase = 'ended';
      lines.push({
        turn,
        timestamp: t0,
        text: 'Hostiles routed — downtown holds.',
        type: 'system',
        highlight: true,
      });
    }
  } else if (enemies.length === 0) {
    outcome = 'victory';
    isCompleted = true;
    phase = 'ended';
    lines.push({
      turn,
      timestamp: t0,
      text: 'Hostiles routed — line holds.',
      type: 'system',
      highlight: true,
    });
  }

  const stateDelta: EncounterCombatStateDelta = {
    currentTurn: turn,
    enemies,
    defenderLine,
    totalEnemyPoints,
    outcome,
    isCompleted,
    phase,
    allySpirit,
    moraleShockTurnsRemaining,
  };

  const wallResult: MassCombatWallSnapshot = {
    hexMap: workingHexMap,
    breached: sk === 'wall' ? breached : false,
  };

  const result: EncounterCombatRoundResult = {
    stateDelta,
    wallResult,
    fightEnded: isCompleted,
    newLogLines: lines,
  };

  if (sk !== 'none') {
    result.hexMap = workingHexMap;
  }

  return result;
}

/** @deprecated Use {@link runEncounterCombatRound}. */
export const runMassDefenseCombatRound = runEncounterCombatRound;

/** Normalizes buckets; used before mass defense rounds. */
export function normalizeMassDefenseDefenderLine(
  line: readonly DefenderLineEntry[],
): DefenderLineEntry[] {
  return line.map((d, i) => ({
    ...d,
    tacticalBucket: d.tacticalBucket ?? defenderBucketForLineIndex(i),
  }));
}

/** Last stand: living defenders ignore retreat flags from the wall phase. */
export function defenderLineForPrefeituraSiege(
  line: DefenderLineEntry[],
): DefenderLineEntry[] {
  return normalizeMassDefenseDefenderLine(line).map((d) =>
    d.currentHp > 0 ? { ...d, retreated: false } : d,
  );
}
