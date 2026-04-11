import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createInitialCityCore } from '../domain/cityEconomy.ts';
import type { CityCoreState } from '../domain/types/city.ts';

interface CityActions {
  setCityCore: (cityCore: CityCoreState) => void;
  patchCityCore: (patch: Partial<CityCoreState>) => void;
  setLastEconomicTickAt: (t: number) => void;
  /** Full reset for new game. */
  reset: () => void;
}

type CityStore = {
  cityCore: CityCoreState;
  /** Last processed economic tick boundary (UTC ms). */
  lastEconomicTickAt: number;
} & CityActions;

function initialCityState(): Pick<
  CityStore,
  'cityCore' | 'lastEconomicTickAt'
> {
  const t = Date.now();
  return {
    cityCore: createInitialCityCore(),
    lastEconomicTickAt: t,
  };
}

export const useCityStore = create<CityStore>()(
  persist(
    (set) => ({
      ...initialCityState(),
      setCityCore: (cityCore) => set({ cityCore }),
      patchCityCore: (patch) =>
        set((s) => ({ cityCore: { ...s.cityCore, ...patch } })),
      setLastEconomicTickAt: (lastEconomicTickAt) => set({ lastEconomicTickAt }),
      reset: () => set(initialCityState()),
    }),
    {
      name: 'peraspera-city',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cityCore: state.cityCore,
        lastEconomicTickAt: state.lastEconomicTickAt,
      }),
    },
  ),
);
