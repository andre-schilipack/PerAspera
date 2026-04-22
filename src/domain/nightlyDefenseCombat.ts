import {
  ALLY_SPIRIT_DEFENDER_HIT,
  ALLY_SPIRIT_PER_KILL,
  ALLY_SPIRIT_STRUCTURE_HIT,
  ALLY_SPIRIT_SUPPORT_CONNECT,
  ALLY_SPIRIT_INITIAL,
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
import {
  resolveGuardDisparoStrike,
  resolveTowerRajadaStrike,
} from './defenseNpcMoves.ts';
import { resolveIncomingMeleeDamage } from './combatResolution.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import { applyDamageToWallSection } from './wallIntegrity.ts';
import type { CombatLogEntry, EnemyInstance } from './types/combat.ts';
import type {
  DailyDefenseState,
  DefenderLineEntry,
  NightlyDefenseOutcome,
  WallState,
} from './types/defense.ts';
import {
  massCombatStructuralPresenceNightlyWall,
  type MassCombatStructuralPresence,
} from './types/massCombat.ts';
import {
  lineAllySpiritShift,
  lineBucketPressureSnapshot,
  lineMoraleShockHits,
  lineSupportStabilizes,
} from '../content/defenseSpiritLines.ts';

/** Theater for nightly wall combat — structural + ally strike cycle (see mass combat types). */
export const NIGHTLY_DEFENSE_STRUCTURAL_PRESENCE: MassCombatStructuralPresence =
  massCombatStructuralPresenceNightlyWall();

export interface NightlyCombatWallResult {
  wall: WallState;
  breached: boolean;
}

export interface AdvanceNightlyDefenseResult {
  nextDaily: DailyDefenseState;
  wallResult: NightlyCombatWallResult;
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

function defaultRng(): number {
  return Math.random();
}

function firstLivingEnemyIndex(enemies: readonly EnemyInstance[]): number {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i]!.currentHealth > 0) return i;
  }
  return -1;
}

function normalizeDefenderLine(
  line: readonly DefenderLineEntry[],
): DefenderLineEntry[] {
  return line.map((d, i) => ({
    ...d,
    tacticalBucket: d.tacticalBucket ?? defenderBucketForLineIndex(i),
  }));
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
function buildEnemyStrikeCycle(
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

/**
 * One full combat round: tower + guards + player line, then living enemies strike.
 */
export function advanceNightlyDefenseRound(
  daily: DailyDefenseState,
  wall: WallState,
  rng: () => number = defaultRng,
): AdvanceNightlyDefenseResult {
  const noop: AdvanceNightlyDefenseResult = {
    nextDaily: daily,
    wallResult: { wall, breached: false },
    fightEnded: false,
    newLogLines: [],
  };

  if (
    daily.isCompleted ||
    daily.phase !== 'fighting' ||
    daily.outcome !== 'active'
  ) {
    return noop;
  }

  if (daily.enemies.length === 0) {
    const roundTs = Date.now();
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
          timestamp: roundTs,
          text: 'No hostiles — defense stands down.',
          type: 'system',
        },
      ],
    };
  }

  const turn = daily.currentTurn + 1;
  const t0 = Date.now();
  const lines: Omit<CombatLogEntry, 'id'>[] = [];
  let enemies = normalizeEnemies(daily.enemies);
  let defenderLine = normalizeDefenderLine(daily.defenderLine);
  let nextWall = wall;
  let breached = false;

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
    text: `— Nightly defense round ${String(turn)} —`,
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
    const towerAfter = livingEnemyCount(enemies);
    killsThisRound += Math.max(0, towerBefore - towerAfter);
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
      const gAfter = livingEnemyCount(enemies);
      killsThisRound += Math.max(0, gBefore - gAfter);
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
    if (def.retreated || def.currentHp <= 0) continue;
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
    const hit = resolveIncomingMeleeDamage(raw, rng);
    const beforeHits = livingEnemyCount(enemies);
    if (hitIdx >= 0) {
      enemies = applyDamageToEnemyAt(enemies, hitIdx, hit.finalDamage);
      const afterHits = livingEnemyCount(enemies);
      killsThisRound += Math.max(0, beforeHits - afterHits);
    }
    lines.push({
      turn,
      timestamp: t0,
      text: hit.flags.dodged
        ? `${def.name}'s strike is evaded${supportBoost ? ' (support net).' : '.'}`
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

  const strikeCycle = buildEnemyStrikeCycle(defenderLine);

  for (let ei = 0; ei < enemies.length; ei++) {
    const e = enemies[ei]!;
    if (breached) break;
    const slot = strikeCycle[ei % strikeCycle.length]!;

    const hitWall = (): void => {
      structureHitsThisRound += 1;
      const raw = rollIntInclusive(
        rng,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
      );
      nextWall = applyDamageToWallSection(
        nextWall,
        daily.attackedSection,
        raw,
      );
      const sec = nextWall.sections[daily.attackedSection];
      breached = sec.breached || sec.current <= 0;
      lines.push({
        turn,
        timestamp: t0,
        text: `Hostiles strike the ${daily.attackedSection} wall for ${String(raw)} structural damage.`,
        type: 'enemy',
      });
    };

    if (slot.kind === 'wall') {
      hitWall();
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
      hitWall();
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
    wallResult: { wall: nextWall, breached },
    fightEnded: isCompleted,
    newLogLines: lines,
  };
}

export function buildDefenderLineFromLocks(
  lockedIds: string[],
  getCharacter: (id: string) =>
    | { name: string; health: { current: number; max: number } }
    | undefined,
): DefenderLineEntry[] {
  const out: DefenderLineEntry[] = [];
  for (const id of lockedIds) {
    const ch = getCharacter(id);
    if (!ch) continue;
    out.push({
      characterId: id,
      name: ch.name,
      currentHp: ch.health.current,
      maxHp: ch.health.max,
      retreated: false,
      tacticalBucket: defenderBucketForLineIndex(out.length),
    });
  }
  return out;
}
