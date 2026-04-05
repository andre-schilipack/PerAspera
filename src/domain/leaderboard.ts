import type { Character } from './types/character.ts';
import type { ScoreEntry } from './types/score.ts';

/**
 * Stable ordering: higher score first, then more recent `updatedAt`, then `characterId`.
 */
export function compareScoreEntries(a: ScoreEntry, b: ScoreEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  return a.characterId.localeCompare(b.characterId);
}

export function topScoreboard(
  entries: readonly ScoreEntry[],
  limit = 10,
): ScoreEntry[] {
  return [...entries].sort(compareScoreEntries).slice(0, limit);
}

export function scoreEntriesFromCharacters(
  characters: Readonly<Record<string, Character>>,
): ScoreEntry[] {
  return Object.values(characters).map((c) => ({
    characterId: c.id,
    name: c.name,
    score: c.score,
    /** Until a dedicated `scoreUpdatedAt` exists, `createdAt` stabilizes sort only. */
    updatedAt: c.createdAt,
  }));
}
