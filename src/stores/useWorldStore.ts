import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Hex, HexMap } from '../domain/types/index.ts';

interface WorldActions {
  setHexMap: (hexMap: HexMap) => void;
  updateHex: (hexId: string, updater: (hex: Hex) => Hex) => void;
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
      updateHex: (hexId, updater) =>
        set((s) => {
          if (!s.hexMap) return s;
          const prev = s.hexMap.hexes[hexId];
          if (!prev) return s;
          return {
            hexMap: {
              ...s.hexMap,
              hexes: {
                ...s.hexMap.hexes,
                [hexId]: updater(prev),
              },
            },
          };
        }),
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
