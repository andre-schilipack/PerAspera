import { DEFENSE_START_HOUR } from '../constants.ts';
import {
  composeWaveFromBudget,
  pickRandomWallCardinal,
  sumLivingThreatPoints,
  targetThreatBudget,
} from '../enemyThreat.ts';
import { formatLocalDateString } from '../defenseSchedule.ts';
import type {
  DailyDefenseState,
  WallCardinal,
  WallState,
} from '../types/index.ts';

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
    phase: 'idle',
    outcome: 'active',
    defenderLine: [],
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
}): DailyDefenseState {
  const attackedSection = pickRandomWallCardinal(params.rng);
  const budget = targetThreatBudget(params.gameDayIndex);
  const enemies = composeWaveFromBudget(budget, params.rng);
  const totalEnemyPoints = sumLivingThreatPoints(enemies);
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
    phase: 'idle',
    outcome: 'active',
    defenderLine: [],
  };
}
