import type { CombatBeatPhase, CombatLogEntry, EnemyInstance } from './combat.ts';
import type { CoreAttributes } from './attributes.ts';

export type StreetSkirmishOutcome = 'active' | 'win' | 'loss';

export type StreetSkirmishPhase = 'preparing' | 'fighting' | 'ended';

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
  /** Snapshot for autoplay (defaults to all-1 stats if absent in params). */
  coreAttributes: CoreAttributes;
  /** Equipped move template ids for this fight. */
  skillIds: string[];
  /** Last emitted narrative beat (avoids duplicate shift lines). */
  lastCombatBeatPhase: CombatBeatPhase | null;
  currentTurn: number;
  enemies: EnemyInstance[];
  playerHealth: number;
  playerMaxHealth: number;
  combatLog: CombatLogEntry[];
  isCompleted: boolean;
  outcome: StreetSkirmishOutcome;
  /** UI/autobattle: wait before auto rounds; lock manual advance during preparing. */
  phase: StreetSkirmishPhase;
}
