import type { ScoreEntry } from './score.ts';

/** Terminal save state when the city cannot continue (e.g. Prefeitura lost). */
export type GameOverReason = 'prefeitura_fallen';

/**
 * One persisted game-over snapshot: top scores at GO, when it ended, and defense day index reached.
 */
export interface HallOfFameEntry {
  fameList: ScoreEntry[];
  gameOverDateTime: number;
  /** Defense `gameDayIndex` at game over (city days survived for scaling). */
  daysSurvived: number;
  reason: GameOverReason;
}

/**
 * Counters for stable string ids (`char_1`, incremental log ids, etc.).
 * Persisted in meta store; bump fields when new id families appear.
 */
export interface NextIdCounters {
  character: number;
  combatLogEntry: number;
  business: number;
  placeSlot: number;
  contract: number;
}

export interface GameMetaState {
  version: string;
  schemaVersion: number;
  createdAt: number;
  globalScoreboard: ScoreEntry[];
  /** Append-only history across runs; not cleared on new game. */
  hallOfFame: HallOfFameEntry[];
  nextIds: NextIdCounters;
  /** When true, the run is over — UI blocks normal play until a new game is started. */
  gameOver: boolean;
  gameOverReason: GameOverReason | null;
  gameOverAt: number | null;
}
