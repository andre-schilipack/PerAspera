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
  PREFECTURE_STRUCTURE_MAX_HP,
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
import { resolveStrikeDamage } from './autobattle/index.ts';
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
import { resolveIncomingMeleeDamage } from './combatResolution.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import { applyDamageToWallSection } from './wallIntegrity.ts';
import type { CombatLogEntry, EnemyInstance } from './types/combat.ts';
import type {
  DailyDefenseState,
  DefenderLineEntry,
  NightlyDefenseOutcome,
  WallCardinal,
  WallState,
} from './types/defense.ts';
import type { MassCombatWallSnapshot } from './types/massCombat.ts';
import type { HexMap, PlaceSlot } from './types/map.ts';
import {
  lineAllySpiritShift,
  lineBucketPressureSnapshot,
  lineMoraleShockHits,
  lineSupportStabilizes,
} from '../content/defenseSpiritLines.ts';

/** Which mass-defense theater this round resolves (wall perimeter vs downtown siege). */
export type MassDefenseStructureMode = 'nightly_wall' | 'prefeitura_siege';

export interface MassDefenseCombatRoundResult {
  nextDaily: DailyDefenseState;
  wallResult: MassCombatWallSnapshot;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
  /** Set only for {@link MassDefenseStructureMode.prefeitura_siege}. */
  hexMap?: HexMap;
}

interface RunMassDefenseCombatRoundBase {
  daily: DailyDefenseState;
  wall: WallState;
  rng: () => number;
  /** Pre-normalized defender line (retreat rules differ by caller). */
  defenderLine: DefenderLineEntry[];
}

export type RunMassDefenseCombatRoundArgs =
  | (RunMassDefenseCombatRoundBase & {
      structureMode: 'nightly_wall';
    })
  | (RunMassDefenseCombatRoundBase & {
      structureMode: 'prefeitura_siege';
      hexMap: HexMap;
    });

function rollIntInclusive(
  rng: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function firstLivingEnemyIndex(enemies: readonly EnemyInstance[]): number {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i]!.currentHealth > 0) return i;
  }
  return -1;
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

function applyStructuralDamageToPrefeitura(
  hexMap: HexMap,
  rawDamage: number,
): { hexMap: HexMap; collapsed: boolean } {
  const center = hexMap.hexes[CENTER_HEX_ID];
  if (!center) return { hexMap, collapsed: true };

  let collapsed = false;
  const placeSlots = center.placeSlots.map((slot) => {
    if (slot.type !== 'prefeitura') return slot;
    const max = slot.structureHp?.max ?? PREFECTURE_STRUCTURE_MAX_HP;
    const cur = slot.structureHp?.current ?? max;
    const next = Math.max(0, cur - rawDamage);
    if (next <= 0) collapsed = true;
    const nextSlot: PlaceSlot = {
      ...slot,
      structureHp: { current: next, max },
    };
    return nextSlot;
  });

  return {
    hexMap: {
      ...hexMap,
      hexes: {
        ...hexMap.hexes,
        [CENTER_HEX_ID]: { ...center, placeSlots },
      },
    },
    collapsed,
  };
}

/**
 * Single source for nightly wall + Prefeitura siege combat rounds (tower, guards,
 * defender melee, enemy strikes, ally spirit, outcomes).
 */
export function runMassDefenseCombatRound(
  args: RunMassDefenseCombatRoundArgs,
): MassDefenseCombatRoundResult {
  const { structureMode, daily, wall, rng, defenderLine: initialDefenderLine } =
    args;

  const turn = daily.currentTurn + 1;
  const t0 = Date.now();
  const lines: Omit<CombatLogEntry, 'id'>[] = [];
  let enemies = normalizeEnemies(daily.enemies);
  let defenderLine = initialDefenderLine;
  let nextWall = wall;
  let breached = false;

  let workingMap: HexMap | undefined =
    structureMode === 'prefeitura_siege' ? args.hexMap : undefined;
  let prefeituraCollapsed = false;

  let allySpirit = clampAllySpirit(
    daily.allySpirit ?? ALLY_SPIRIT_INITIAL,
  );
  let moraleShockTurnsRemaining = decrementMoraleShock(
    daily.moraleShockTurnsRemaining ?? 0,
  );

  const spiritBeforeRound = allySpirit;
  let killsThisRound = 0;
  let defenderHitsThisRound = 0;
  let structureHitsThisRound = 0;

  const roundTitle =
    structureMode === 'nightly_wall'
      ? `— Nightly defense round ${String(turn)} —`
      : `— Prefeitura siege round ${String(turn)} —`;

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
    if (structureMode === 'nightly_wall') {
      return def.retreated || def.currentHp <= 0;
    }
    return def.currentHp <= 0;
  };

  for (const def of defenderLine) {
    if (skipDefender(def)) continue;
    if (firstLivingEnemyIndex(enemies) < 0) break;
    let raw = rollIntInclusive(rng, 5, 12);
    raw = Math.max(1, Math.floor(raw * outgoingMul));

    let supportBoost = false;
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

    const prefBucket = def.tacticalBucket ?? 'front';
    const hitIdx = pickLivingEnemyIndexPreferBucket(enemies, prefBucket, rng);
    const hit =
      def.coreAttributes !== undefined
        ? resolveStrikeDamage(
            raw,
            'physical',
            DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES,
            rng,
          )
        : resolveIncomingMeleeDamage(raw, rng);
    const beforeHits = livingEnemyCount(enemies);
    if (hitIdx >= 0) {
      enemies = applyDamageToEnemyAt(enemies, hitIdx, hit.finalDamage);
      killsThisRound += Math.max(0, beforeHits - livingEnemyCount(enemies));
    }

    const dodgePlayer =
      structureMode === 'nightly_wall'
        ? `${def.name}'s strike is evaded${supportBoost ? ' (support net).' : '.'}`
        : `${def.name}'s strike is evaded.`;

    lines.push({
      turn,
      timestamp: t0,
      text: hit.flags.dodged ? dodgePlayer : `${def.name} (${prefBucket}) hits for ${String(hit.finalDamage)} damage.`,
      type: 'player',
    });
  }

  enemies = enemies.filter((e) => e.currentHealth > 0);

  allySpirit = clampAllySpirit(
    allySpirit + killsThisRound * ALLY_SPIRIT_PER_KILL,
  );
  allySpirit = clampAllySpirit(
    allySpirit + evaluateFrontGapSpiritDelta(enemies),
  );

  const attackedSection: WallCardinal = daily.attackedSection;

  const hitWallSection = (): void => {
    structureHitsThisRound += 1;
    const raw = rollIntInclusive(
      rng,
      DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
      DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
    );
    nextWall = applyDamageToWallSection(nextWall, attackedSection, raw);
    const sec = nextWall.sections[attackedSection];
    breached = sec.breached || sec.current <= 0;
    lines.push({
      turn,
      timestamp: t0,
      text: `Hostiles strike the ${attackedSection} wall for ${String(raw)} structural damage.`,
      type: 'enemy',
    });
  };

  if (structureMode === 'nightly_wall') {
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
      const strike = resolveIncomingMeleeDamage(rawMelee, rng);
      const nextHp = strike.flags.dodged
        ? d.currentHp
        : Math.max(0, d.currentHp - strike.finalDamage);
      if (!strike.flags.dodged && strike.finalDamage > 0) {
        defenderHitsThisRound += 1;
      }
      let nextD: DefenderLineEntry = { ...d, currentHp: nextHp };
      nextD = applyRetreatRules(nextD);
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
        const hitPref = applyStructuralDamageToPrefeitura(
          workingMap!,
          rawStruct,
        );
        workingMap = hitPref.hexMap;
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
        const hitFallback = applyStructuralDamageToPrefeitura(
          workingMap!,
          rawFallback,
        );
        workingMap = hitFallback.hexMap;
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
      const strike = resolveIncomingMeleeDamage(rawMelee, rng);
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
  let outcome: NightlyDefenseOutcome = daily.outcome;
  let isCompleted = false;
  let phase: DailyDefenseState['phase'] = daily.phase;

  if (structureMode === 'nightly_wall') {
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
  } else {
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
  }

  const nextDaily: DailyDefenseState = {
    ...daily,
    currentTurn: turn,
    enemies,
    defenderLine,
    totalEnemyPoints,
    combatLog: daily.combatLog,
    outcome,
    isCompleted,
    phase,
    victoryLootPool: daily.victoryLootPool,
    allySpirit,
    moraleShockTurnsRemaining,
  };

  const wallResult: MassCombatWallSnapshot = {
    wall: nextWall,
    breached: structureMode === 'nightly_wall' ? breached : false,
  };

  const result: MassDefenseCombatRoundResult = {
    nextDaily,
    wallResult,
    fightEnded: isCompleted,
    newLogLines: lines,
  };

  if (structureMode === 'prefeitura_siege' && workingMap !== undefined) {
    result.hexMap = workingMap;
  }

  return result;
}

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
