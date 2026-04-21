import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFENSE_START_HOUR } from '../domain/constants.ts';
import { formatLocalDateString } from '../domain/defenseSchedule.ts';
import {
  createInitialWallState,
  rollDailyDefenseStateForNewDay,
} from '../domain/factories/createDefenseSeed.ts';
import { defenseEndScreenFromCommit } from '../game/defenseEndScreenFromCommit.ts';
import {
  applyNightlyDefenseAdvanceCommit,
  buildNightlyDefenseAdvanceCommit,
} from '../game/nightlyDefenseAdvance.ts';
import type {
  DailyDefenseState,
  DefenseCatchUpNightRow,
  DefenseEndScreenState,
  WallState,
} from '../domain/types/index.ts';

import { useCharactersStore } from './useCharactersStore.ts';
import { useCityStore } from './useCityStore.ts';
import { useMetaStore } from './useMetaStore.ts';
import { useWorldStore } from './useWorldStore.ts';

/** Ephemeral aggregated modal after bootstrap catch-up (not persisted). */
export interface DefenseCatchUpBatchPayload {
  nightSummaries: DefenseCatchUpNightRow[];
  nightsProcessed: number;
  abortedOnGameOver: boolean;
}

interface DefenseActions {
  setDailyDefense: (dailyDefense: DailyDefenseState) => void;
  patchDailyDefense: (patch: Partial<DailyDefenseState>) => void;
  setWall: (wall: WallState) => void;
  /** One combat round: domain commit + cross-store apply (centered here). */
  advanceNightlyDefenseRound: (rng?: () => number) => void;
  dismissDefenseEndScreen: () => void;
  /** Shows once after offline night simulation; silences per-night defense modals. */
  openDefenseCatchUpSummary: (payload: DefenseCatchUpBatchPayload) => void;
  dismissDefenseCatchUpSummary: () => void;
  reset: () => void;
}

type DefenseSlice = {
  dailyDefense: DailyDefenseState;
  wall: WallState;
  /** Ephemeral victory/defeat modal payload (excluded from persist). */
  defenseEndScreen: DefenseEndScreenState | null;
  /** Bootstrap catch-up aggregate (excluded from persist). */
  defenseCatchUpSummary: DefenseCatchUpBatchPayload | null;
};

type DefenseStore = DefenseSlice & DefenseActions;

function initialDefenseState(): DefenseSlice {
  const now = new Date();
  return {
    dailyDefense: rollDailyDefenseStateForNewDay({
      date: formatLocalDateString(now),
      gameDayIndex: 0,
      startHour: DEFENSE_START_HOUR,
      rng: Math.random,
    }),
    wall: createInitialWallState(),
    defenseEndScreen: null,
    defenseCatchUpSummary: null,
  };
}

export const useDefenseStore = create<DefenseStore>()(
  persist(
    (set, get) => ({
      ...initialDefenseState(),
      setDailyDefense: (dailyDefense) => set({ dailyDefense }),
      patchDailyDefense: (patch) =>
        set((s) => ({ dailyDefense: { ...s.dailyDefense, ...patch } })),
      setWall: (wall) => set({ wall }),
      openDefenseCatchUpSummary: (payload) =>
        set({
          defenseCatchUpSummary: payload,
          defenseEndScreen: null,
        }),
      dismissDefenseCatchUpSummary: () =>
        set({ defenseCatchUpSummary: null }),
      advanceNightlyDefenseRound: (rng = Math.random) => {
        const commit = buildNightlyDefenseAdvanceCommit(
          {
            dailyDefense: get().dailyDefense,
            wall: get().wall,
            nextCombatLogEntryId: useMetaStore.getState().nextIds.combatLogEntry,
            civilianPopulation: useCityStore.getState().civilianPopulation,
            hexMap: useWorldStore.getState().hexMap,
          },
          rng,
          Date.now(),
        );
        applyNightlyDefenseAdvanceCommit(commit, {
          setWall: (wall) => get().setWall(wall),
          patchNextIds: useMetaStore.getState().patchNextIds,
          setDailyDefense: (dailyDefense) => get().setDailyDefense(dailyDefense),
          updateCharacter: useCharactersStore.getState().updateCharacter,
          getCharacter: (id) => useCharactersStore.getState().characters[id],
          setCivilianPopulation: useCityStore.getState().setCivilianPopulation,
          setHexMap: useWorldStore.getState().setHexMap,
          addItemToInventory: useCharactersStore.getState().addItemToInventory,
        });
        const end = defenseEndScreenFromCommit(commit, (id) => {
          const ch = useCharactersStore.getState().characters[id];
          return ch?.name ?? id;
        });
        if (end) {
          set({ defenseEndScreen: end });
        }
      },
      dismissDefenseEndScreen: () => set({ defenseEndScreen: null }),
      reset: () =>
        set({
          ...initialDefenseState(),
          defenseCatchUpSummary: null,
        }),
    }),
    {
      name: 'peraspera-defense',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        dailyDefense: state.dailyDefense,
        wall: state.wall,
      }),
    },
  ),
);
