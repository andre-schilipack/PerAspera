import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { GAME_VERSION, SCHEMA_VERSION } from '../domain/constants.ts';
import type {
  GameMetaState,
  HallOfFameEntry,
  NextIdCounters,
  ScoreEntry,
} from '../domain/types/index.ts';

function defaultNextIds(): NextIdCounters {
  return {
    character: 0,
    combatLogEntry: 0,
    business: 0,
    placeSlot: 0,
    contract: 0,
  };
}

function initialMetaState(): GameMetaState {
  return {
    version: GAME_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    globalScoreboard: [],
    hallOfFame: [],
    nextIds: defaultNextIds(),
    gameOver: false,
    gameOverReason: null,
    gameOverAt: null,
  };
}

interface MetaActions {
  setVersion: (version: string) => void;
  setCreatedAt: (createdAt: number) => void;
  replaceGlobalScoreboard: (globalScoreboard: ScoreEntry[]) => void;
  patchNextIds: (patch: Partial<NextIdCounters>) => void;
  /** Replace persisted fields after {@link migrateGameMetaState}. */
  applyMetaSnapshot: (snapshot: GameMetaState) => void;
  /** Terminal run + append {@link HallOfFameEntry} — blocks play until new game. */
  recordGameOverRun: (entry: HallOfFameEntry) => void;
  clearGameOver: () => void;
  reset: () => void;
}

type MetaStore = GameMetaState & MetaActions;

export const useMetaStore = create<MetaStore>()(
  persist(
    (set) => ({
      ...initialMetaState(),
      setVersion: (version) => set({ version }),
      setCreatedAt: (createdAt) => set({ createdAt }),
      replaceGlobalScoreboard: (globalScoreboard) => set({ globalScoreboard }),
      patchNextIds: (patch) =>
        set((s) => ({ nextIds: { ...s.nextIds, ...patch } })),
      applyMetaSnapshot: (snapshot) =>
        set({
          version: snapshot.version,
          schemaVersion: snapshot.schemaVersion,
          createdAt: snapshot.createdAt,
          globalScoreboard: snapshot.globalScoreboard,
          hallOfFame: snapshot.hallOfFame ?? [],
          nextIds: snapshot.nextIds,
          gameOver: snapshot.gameOver,
          gameOverReason: snapshot.gameOverReason,
          gameOverAt: snapshot.gameOverAt,
        }),
      recordGameOverRun: (entry) =>
        set((s) => ({
          gameOver: true,
          gameOverReason: entry.reason,
          gameOverAt: entry.gameOverDateTime,
          hallOfFame: [...s.hallOfFame, entry],
        })),
      clearGameOver: () =>
        set({
          gameOver: false,
          gameOverReason: null,
          gameOverAt: null,
        }),
      reset: () => set(initialMetaState()),
    }),
    {
      name: 'peraspera-meta',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        version: state.version,
        schemaVersion: state.schemaVersion,
        createdAt: state.createdAt,
        globalScoreboard: state.globalScoreboard,
        hallOfFame: state.hallOfFame,
        nextIds: state.nextIds,
        gameOver: state.gameOver,
        gameOverReason: state.gameOverReason,
        gameOverAt: state.gameOverAt,
      }),
    },
  ),
);
