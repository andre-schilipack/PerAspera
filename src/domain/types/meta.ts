import type { ScoreEntry } from './score.ts';

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
  nextIds: NextIdCounters;
}
