import type { CombatLogEntry } from './combat.ts';
import type { BattleResult } from '../combat/core/types.ts';

export type StreetSkirmishOutcome = 'win' | 'loss' | 'draw';

/**
 * Volatile street fight after a patrol encounter (not persisted).
 * Battle is fully resolved up-front via `simulateBattle`; UI only plays back.
 */
export interface StreetSkirmishSession {
  hexId: string;
  danger: number;
  characterId: string;
  characterName: string;
  playerHealth: number;
  playerMaxHealth: number;
  enemyLabel: string;
  enemyHp: number;
  enemyMaxHp: number;
  outcome: StreetSkirmishOutcome;
  /** `CombatLogEntry.turn` stores the combat tick for tab grouping. */
  combatLog: CombatLogEntry[];
  battleResult: BattleResult;
  rewardsApplied: boolean;
}
