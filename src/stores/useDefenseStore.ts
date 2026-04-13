import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFENSE_START_HOUR } from '../domain/constants.ts';
import { formatLocalDateString } from '../domain/defenseSchedule.ts';
import {
  createInitialWallState,
  rollDailyDefenseStateForNewDay,
} from '../domain/factories/createDefenseSeed.ts';
import type { DailyDefenseState, WallState } from '../domain/types/index.ts';

interface DefenseActions {
  setDailyDefense: (dailyDefense: DailyDefenseState) => void;
  patchDailyDefense: (patch: Partial<DailyDefenseState>) => void;
  setWall: (wall: WallState) => void;
  reset: () => void;
}

type DefenseSlice = {
  dailyDefense: DailyDefenseState;
  wall: WallState;
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
  };
}

export const useDefenseStore = create<DefenseStore>()(
  persist(
    (set) => ({
      ...initialDefenseState(),
      setDailyDefense: (dailyDefense) => set({ dailyDefense }),
      patchDailyDefense: (patch) =>
        set((s) => ({ dailyDefense: { ...s.dailyDefense, ...patch } })),
      setWall: (wall) => set({ wall }),
      reset: () => set(initialDefenseState()),
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
