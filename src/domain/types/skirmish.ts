import type { CombatLogEntry, EnemyInstance } from './combat.ts';

export type StreetSkirmishOutcome = 'active' | 'win' | 'loss';

/**
 * Volatile street fight after a patrol encounter (not persisted).
 * Separate from {@link DailyDefenseState}.
 */
export interface StreetSkirmishState {
  hexId: string;
  /** Danger rating of the hex where the fight started (0–100). */
  danger: number;
  characterId: string;
  characterName: string;
  currentTurn: number;
  enemies: EnemyInstance[];
  playerHealth: number;
  playerMaxHealth: number;
  combatLog: CombatLogEntry[];
  isCompleted: boolean;
  outcome: StreetSkirmishOutcome;
}
