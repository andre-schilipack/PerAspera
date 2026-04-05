import { scoreEntriesFromCharacters } from '../domain/leaderboard.ts';
import type { Character } from '../domain/types/index.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';

/** Mirrors character scores into persisted `globalScoreboard` (single-player local). */
export function syncGlobalScoreboardFromCharacters(
  characters: Readonly<Record<string, Character>>,
): void {
  useMetaStore
    .getState()
    .replaceGlobalScoreboard(scoreEntriesFromCharacters(characters));
}
