import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { HexMap } from '../domain/types/index.ts';

interface WorldActions {
  setHexMap: (hexMap: HexMap) => void;
  clearHexMap: () => void;
  reset: () => void;
}

type WorldState = {
  hexMap: HexMap | null;
};

type WorldStore = WorldState & WorldActions;

const initialWorldState = (): WorldState => ({
  hexMap: null,
});

export const useWorldStore = create<WorldStore>()(
  persist(
    (set) => ({
      ...initialWorldState(),
      setHexMap: (hexMap) => set({ hexMap }),
      clearHexMap: () => set({ hexMap: null }),
      reset: () => set(initialWorldState()),
    }),
    {
      name: 'peraspera-world',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        hexMap: state.hexMap,
      }),
    },
  ),
);
