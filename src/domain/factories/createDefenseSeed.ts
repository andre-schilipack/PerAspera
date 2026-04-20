import {
  CENTER_HEX_ID,
  DEFENSE_START_HOUR,
  HOME_HEX_ID,
} from '../constants.ts';
import {
  composeWaveFromBudget,
  pickRandomWallCardinal,
  sumLivingThreatPoints,
  targetThreatBudget,
} from '../enemyThreat.ts';
import { rollVictoryLootPoolForWave } from '../nightlyDefenseLoot.ts';
import { formatLocalDateString } from '../defenseSchedule.ts';
import type {
  DailyDefenseState,
  HexMap,
  WallCardinal,
  WallState,
} from '../types/index.ts';

/** Random civilian hex used as nightly breach march entry (never Centro). */
export function pickRandomRaidTargetHex(
  hexMap: HexMap,
  rng: () => number,
): string {
  const ids = Object.keys(hexMap.hexes).filter((id) => id !== CENTER_HEX_ID);
  if (ids.length === 0) return HOME_HEX_ID;
  return ids[Math.floor(rng() * ids.length)]!;
}

export function createInitialWallState(): WallState {
  /** Real-valued integrity; UI uses floor/ceil via economicDisplay. */
  const section = () => ({
    current: 100,
    max: 100,
    breached: false,
  });
  return {
    level: 1,
    layers: 1,
    sections: {
      north: section(),
      south: section(),
      east: section(),
      west: section(),
    },
  };
}

export function createEmptyDailyDefense(params?: {
  date?: string;
  startHour?: number;
  attackedSection?: WallCardinal;
  /** Defaults to 0 (new day rollover should pass prior index + 1). */
  gameDayIndex?: number;
  targetHexId?: string;
}): DailyDefenseState {
  const now = new Date();
  const date = params?.date ?? formatLocalDateString(now);
  return {
    date,
    currentTurn: 0,
    isLocked: {},
    lockedAt: {},
    enlistedForDate: {},
    combatLog: [],
    enemies: [],
    totalEnemyPoints: 0,
    playerContribution: {},
    isCompleted: false,
    startHour: params?.startHour ?? DEFENSE_START_HOUR,
    attackedSection: params?.attackedSection ?? 'north',
    participants: [],
    gameDayIndex: params?.gameDayIndex ?? 0,
    targetHexId: params?.targetHexId ?? HOME_HEX_ID,
    phase: 'idle',
    outcome: 'active',
    defenderLine: [],
    victoryLootPool: [],
  };
}

/**
 * Roll a new calendar day: random wall side, scaled wave, cleared locks (daily re-enlist MVP).
 */
export function rollDailyDefenseStateForNewDay(params: {
  date: string;
  gameDayIndex: number;
  startHour: number;
  rng: () => number;
  /** When set, used as march entry; otherwise derived from optional `hexMap`. */
  targetHexId?: string;
  hexMap?: HexMap | null;
}): DailyDefenseState {
  const attackedSection = pickRandomWallCardinal(params.rng);
  const budget = targetThreatBudget(params.gameDayIndex);
  const enemies = composeWaveFromBudget(budget, params.rng);
  const totalEnemyPoints = sumLivingThreatPoints(enemies);
  const victoryLootPool = rollVictoryLootPoolForWave(
    enemies,
    params.rng,
    `day_${params.date}`,
  );
  const targetHexId =
    params.targetHexId ??
    (params.hexMap
      ? pickRandomRaidTargetHex(params.hexMap, params.rng)
      : HOME_HEX_ID);
  return {
    date: params.date,
    currentTurn: 0,
    isLocked: {},
    lockedAt: {},
    enlistedForDate: {},
    combatLog: [],
    enemies,
    totalEnemyPoints,
    playerContribution: {},
    isCompleted: false,
    startHour: params.startHour,
    attackedSection,
    participants: [],
    gameDayIndex: params.gameDayIndex,
    targetHexId,
    phase: 'idle',
    outcome: 'active',
    defenderLine: [],
    victoryLootPool,
  };
}
