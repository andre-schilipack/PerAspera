import {
  CENTER_HEX_ID,
  DEFENSE_START_HOUR,
  HOME_HEX_ID,
} from '../constants.ts';
import {
  composeWaveFromBudget,
  sumLivingThreatPoints,
  targetThreatBudget,
} from '../enemyThreat.ts';
import { rollVictoryLootPoolForWave } from '../nightlyDefenseLoot.ts';
import { formatLocalDateString } from '../defenseSchedule.ts';
import type { DailyDefenseState, HexMap } from '../types/index.ts';

/** Random civilian hex used as nightly breach march entry (never Centro). */
export function pickRandomRaidTargetHex(
  hexMap: HexMap,
  rng: () => number,
): string {
  const ids = Object.keys(hexMap.hexes).filter((id) => id !== CENTER_HEX_ID);
  if (ids.length === 0) return HOME_HEX_ID;
  return ids[Math.floor(rng() * ids.length)]!;
}

export function createEmptyDailyDefense(params?: {
  date?: string;
  startHour?: number;
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
 * Roll a new calendar day: scaled wave, cleared locks (daily re-enlist MVP).
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
    participants: [],
    gameDayIndex: params.gameDayIndex,
    targetHexId,
    phase: 'idle',
    outcome: 'active',
    defenderLine: [],
    victoryLootPool,
  };
}
