import { DEFENSE_START_HOUR } from '../constants.ts';
import { formatLocalDateString } from '../defenseSchedule.ts';
import type {
  DailyDefenseState,
  WallCardinal,
  WallState,
} from '../types/index.ts';

export function createInitialWallState(): WallState {
  const section = () => ({
    current: 100,
    max: 100,
    breached: false,
  });
  return {
    level: 1,
    layers: 1,
    sections: {
      norte: section(),
      sul: section(),
      leste: section(),
      oeste: section(),
    },
  };
}

export function createEmptyDailyDefense(params?: {
  date?: string;
  startHour?: number;
  attackedSection?: WallCardinal;
}): DailyDefenseState {
  const now = new Date();
  const date = params?.date ?? formatLocalDateString(now);
  return {
    date,
    currentTurn: 0,
    isLocked: {},
    lockedAt: {},
    combatLog: [],
    enemies: [],
    totalEnemyPoints: 0,
    playerContribution: {},
    isCompleted: false,
    startHour: params?.startHour ?? DEFENSE_START_HOUR,
    attackedSection: params?.attackedSection ?? 'norte',
    participants: [],
    gameDayIndex: 0,
  };
}
