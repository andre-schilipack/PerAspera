import {
  ALLY_SPIRIT_DEFENDER_HIT,
  ALLY_SPIRIT_INITIAL,
  ALLY_SPIRIT_PER_KILL,
  ALLY_SPIRIT_STRUCTURE_HIT,
  ALLY_SPIRIT_SUPPORT_CONNECT,
  DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
  DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
  DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
  DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
  DEFENSE_GUARD_DAMAGE_MAX,
  DEFENSE_GUARD_DAMAGE_MIN,
  DEFENSE_NPC_GUARD_IDS,
  DEFENSE_NPC_TOWER_LABEL,
  DEFENSE_TOWER_DAMAGE_MAX,
  DEFENSE_TOWER_DAMAGE_MIN,
  CENTER_HEX_ID,
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
import type { CombatLogEntry, EnemyInstance } from './types/combat.ts';
import type {
  DailyDefenseState,
  DefenderLineEntry,
  NightlyDefenseOutcome,
  WallState,
} from './types/defense.ts';
import type { HexMap, PlaceSlot } from './types/map.ts';

import type { NightlyCombatWallResult } from './nightlyDefenseCombat.ts';
import {
  lineAllySpiritShift,
  lineBucketPressureSnapshot,
  lineMoraleShockHits,
  lineSupportStabilizes,
} from '../content/defenseSpiritLines.ts';

export interface AdvancePrefeituraSiegeResult {
  nextDaily: DailyDefenseState;
  wallResult: NightlyCombatWallResult;
  hexMap: HexMap;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
}

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

function applyDamageToEnemyAtPref(
  enemies: EnemyInstance[],
  index: number,
  damage: number,
): EnemyInstance[] {
  return applyDamageToEnemyAt(enemies, index, damage);
}

function normalizeEnemies(list: readonly EnemyInstance[]): EnemyInstance[] {
  return list.map((e, i) => ({
    ...e,
    tacticalBucket: e.tacticalBucket ?? enemyBucketForSpawnIndex(i),
  }));
}

function normalizeDefenderLinePref(
  line: readonly DefenderLineEntry[],
): DefenderLineEntry[] {
  return line.map((d, i) => ({
    ...d,
    tacticalBucket: d.tacticalBucket ?? defenderBucketForLineIndex(i),
  }));
}

/** Last stand: everyone still alive holds the line (ignore retreat flags from wall phase). */
function defenderLineForPrefeituraSiege(
  line: DefenderLineEntry[],
): DefenderLineEntry[] {
  return normalizeDefenderLinePref(line).map((d) =>
    d.currentHp > 0 ? { ...d, retreated: false } : d,
  );
}

/** Living defenders in line order, then the Prefeitura (retreat does not apply here). */
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
 * Downtown last stand: reuses tower, guards, and defender melee vs enemies; enemy
 * strikes alternate players and Prefeitura structural HP (same damage band as wall hits).
 */
export function advancePrefeituraSiegeRound(
  daily: DailyDefenseState,
  wall: WallState,
  hexMap: HexMap,
  rng: () => number,
): AdvancePrefeituraSiegeResult {
  const noop: AdvancePrefeituraSiegeResult = {
    nextDaily: daily,
    wallResult: { wall, breached: false },
    fightEnded: false,
    newLogLines: [],
    hexMap,
  };

  if (
    daily.isCompleted ||
    daily.phase !== 'fighting' ||
    daily.outcome !== 'prefeitura_siege'
  ) {
    return noop;
  }

  if (daily.enemies.length === 0) {
    return {
      nextDaily: {
        ...daily,
        isCompleted: true,
        phase: 'ended',
        outcome: 'victory',
        victoryLootPool: daily.victoryLootPool,
      },
      wallResult: { wall, breached: false },
      fightEnded: true,
      newLogLines: [
        {
          turn: daily.currentTurn,
          timestamp: Date.now(),
          text: 'No hostiles downtown — Prefeitura secured.',
          type: 'system',
        },
      ],
      hexMap,
    };
  }

  const turn = daily.currentTurn + 1;
  const t0 = Date.now();
  const lines: Omit<CombatLogEntry, 'id'>[] = [];
  let enemies = normalizeEnemies(daily.enemies);
  let defenderLine = defenderLineForPrefeituraSiege(daily.defenderLine);
  let workingMap = hexMap;

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

  lines.push({
    turn,
    timestamp: t0,
    text: `— Prefeitura siege round ${String(turn)} —`,
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
  const towerHit = resolveIncomingMeleeDamage(towerRaw, rng);
  const tBefore = livingEnemyCount(enemies);
  if (towerIdx >= 0) {
    enemies = applyDamageToEnemyAtPref(enemies, towerIdx, towerHit.finalDamage);
    killsThisRound += Math.max(
      0,
      tBefore - livingEnemyCount(enemies),
    );
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
    const gh = resolveIncomingMeleeDamage(graw, rng);
    const gBefore = livingEnemyCount(enemies);
    if (gIdx >= 0) {
      enemies = applyDamageToEnemyAtPref(enemies, gIdx, gh.finalDamage);
      killsThisRound += Math.max(
        0,
        gBefore - livingEnemyCount(enemies),
      );
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

  for (const def of defenderLine) {
    if (def.currentHp <= 0) continue;
    if (firstLivingEnemyIndex(enemies) < 0) break;
    let raw = rollIntInclusive(rng, 5, 12);
    raw = Math.max(1, Math.floor(raw * outgoingMul));

    if (def.tacticalBucket === 'support' && rng() < 0.38) {
      allySpirit = clampAllySpirit(allySpirit + ALLY_SPIRIT_SUPPORT_CONNECT);
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
    const hit = resolveIncomingMeleeDamage(raw, rng);
    const hBefore = livingEnemyCount(enemies);
    if (hitIdx >= 0) {
      enemies = applyDamageToEnemyAtPref(enemies, hitIdx, hit.finalDamage);
      killsThisRound += Math.max(
        0,
        hBefore - livingEnemyCount(enemies),
      );
    }
    lines.push({
      turn,
      timestamp: t0,
      text: hit.flags.dodged
        ? `${def.name}'s strike is evaded.`
        : `${def.name} (${prefBucket}) hits for ${String(hit.finalDamage)} damage.`,
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

  const strikeCycle = buildPrefeituraSiegeStrikeCycle(defenderLine);
  let prefeituraCollapsed = false;

  for (let ei = 0; ei < enemies.length && !prefeituraCollapsed; ei++) {
    const e = enemies[ei]!;
    const slot = strikeCycle[ei % strikeCycle.length]!;

    if (slot.kind === 'prefeitura') {
      structureHitsThisRound += 1;
      const raw = rollIntInclusive(
        rng,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
      );
      const hit = applyStructuralDamageToPrefeitura(workingMap, raw);
      workingMap = hit.hexMap;
      lines.push({
        turn,
        timestamp: t0,
        text: `Hostiles strike the Prefeitura for ${String(raw)} structural damage.`,
        type: 'enemy',
      });
      if (hit.collapsed) {
        prefeituraCollapsed = true;
        lines.push({
          turn,
          timestamp: Date.now(),
          text: 'The Prefeitura has fallen.',
          type: 'system',
          highlight: true,
        });
        break;
      }
      continue;
    }

    let di = resolveDefenderStrikeLineIndex(e, defenderLine, slot.lineIndex);
    const d = defenderLine[di]!;
    if (d.currentHp <= 0) {
      structureHitsThisRound += 1;
      const rawFallback = rollIntInclusive(
        rng,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
      );
      const hit = applyStructuralDamageToPrefeitura(workingMap, rawFallback);
      workingMap = hit.hexMap;
      lines.push({
        turn,
        timestamp: t0,
        text: `${e.enemyId} pressures the line — strike hits the Prefeitura for ${String(rawFallback)} structural damage.`,
        type: 'enemy',
      });
      if (hit.collapsed) {
        prefeituraCollapsed = true;
        lines.push({
          turn,
          timestamp: Date.now(),
          text: 'The Prefeitura has fallen.',
          type: 'system',
          highlight: true,
        });
      }
      continue;
    }

    const raw = rollIntInclusive(
      rng,
      DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
      DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
    );
    const strike = resolveIncomingMeleeDamage(raw, rng);
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
      timestamp: Date.now(),
      text: lineMoraleShockHits(),
      type: 'system',
      highlight: true,
    });
  }

  const spiritDelta = allySpirit - spiritBeforeRound;
  if (spiritDelta !== 0 || shockRoll.triggered) {
    lines.push({
      turn,
      timestamp: Date.now(),
      text: lineAllySpiritShift(spiritDelta, allySpirit),
      type: 'system',
    });
  }

  const totalEnemyPoints = sumLivingThreatPoints(enemies);
  let outcome: NightlyDefenseOutcome = daily.outcome;
  let isCompleted = false;
  let phase: DailyDefenseState['phase'] = daily.phase;

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
      timestamp: Date.now(),
      text: 'Hostiles routed — downtown holds.',
      type: 'system',
      highlight: true,
    });
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

  return {
    nextDaily,
    wallResult: { wall, breached: false },
    fightEnded: isCompleted,
    newLogLines: lines,
    hexMap: workingMap,
  };
}
