import type { DefenseEndScreenState } from '../domain/types/defense.ts';
import type { NightlyDefenseAdvanceCommit } from './nightlyDefenseAdvance.ts';

/**
 * Builds a one-shot UI payload after a completed nightly defense round.
 */
export function defenseEndScreenFromCommit(
  commit: NightlyDefenseAdvanceCommit,
  getCharacterName: (characterId: string) => string,
): DefenseEndScreenState | null {
  if (commit.declareGameOver) {
    return null;
  }
  const d = commit.dailyDefense;
  if (!d.isCompleted) {
    return null;
  }
  if (d.outcome === 'victory') {
    const lootById = new Map(
      (commit.victoryLootGrants ?? []).map((g) => [g.characterId, g.items]),
    );
    const participants = (commit.victoryRewards ?? []).map((r) => ({
      characterId: r.characterId,
      name: getCharacterName(r.characterId),
      scoreDelta: r.scoreDelta,
      reputationDelta: r.reputationDelta,
      credsDelta: r.credsDelta,
      items: lootById.get(r.characterId) ?? [],
    }));
    return { kind: 'victory', participants };
  }
  if (d.outcome === 'breach') {
    return { kind: 'defeat', variant: 'breach' };
  }
  return null;
}
