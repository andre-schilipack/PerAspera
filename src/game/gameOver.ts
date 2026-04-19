import { scoreEntriesFromCharacters, topScoreboard } from '../domain/leaderboard.ts';
import type { GameOverReason } from '../domain/types/index.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';

/** Call when the city can no longer continue (e.g. Prefeitura destroyed). */
export function declareGameOver(reason: GameOverReason, at: number = Date.now()): void {
  if (useMetaStore.getState().gameOver) {
    return;
  }
  const characters = useCharactersStore.getState().characters;
  const fameList = topScoreboard(scoreEntriesFromCharacters(characters), 10);
  const daysSurvived = useDefenseStore.getState().dailyDefense.gameDayIndex;
  useMetaStore.getState().recordGameOverRun({
    fameList,
    gameOverDateTime: at,
    daysSurvived,
    reason,
  });
}
