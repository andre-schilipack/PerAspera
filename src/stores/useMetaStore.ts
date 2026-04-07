import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { GAME_VERSION, SCHEMA_VERSION } from '../domain/constants.ts';
import type { GameMetaState, NextIdCounters, ScoreEntry } from '../domain/types/index.ts';

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
    nextIds: defaultNextIds(),
  };
}

interface MetaActions {
  setVersion: (version: string) => void;
  setCreatedAt: (createdAt: number) => void;
  replaceGlobalScoreboard: (globalScoreboard: ScoreEntry[]) => void;
  patchNextIds: (patch: Partial<NextIdCounters>) => void;
  /** Replace persisted fields after {@link migrateGameMetaState}. */
  applyMetaSnapshot: (snapshot: GameMetaState) => void;
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
          nextIds: snapshot.nextIds,
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
        nextIds: state.nextIds,
      }),
    },
  ),
);
