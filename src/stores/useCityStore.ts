import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createInitialCityCore } from '../domain/cityEconomy.ts';
import { INITIAL_CIVILIAN_POPULATION } from '../domain/constants.ts';
import type { CityCoreState } from '../domain/types/city.ts';

interface CityActions {
  setCityCore: (cityCore: CityCoreState) => void;
  patchCityCore: (patch: Partial<CityCoreState>) => void;
  setLastEconomicTickAt: (t: number) => void;
  setCivilianPopulation: (n: number) => void;
  setEconomicTickCounter: (n: number) => void;
  /** Full reset for new game. */
  reset: () => void;
}

type CityStore = {
  cityCore: CityCoreState;
  /** Last processed economic tick boundary (UTC ms). */
  lastEconomicTickAt: number;
  /** Total economic ticks applied (for wage day modulo). */
  economicTickCounter: number;
  civilianPopulation: number;
} & CityActions;

function initialCityState(): Pick<
  CityStore,
  'cityCore' | 'lastEconomicTickAt' | 'economicTickCounter' | 'civilianPopulation'
> {
  const t = Date.now();
  return {
    cityCore: createInitialCityCore(),
    lastEconomicTickAt: t,
    economicTickCounter: 0,
    civilianPopulation: INITIAL_CIVILIAN_POPULATION,
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
      setCivilianPopulation: (civilianPopulation) => set({ civilianPopulation }),
      setEconomicTickCounter: (economicTickCounter) =>
        set({ economicTickCounter }),
      reset: () => set(initialCityState()),
    }),
    {
      name: 'peraspera-city',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cityCore: state.cityCore,
        lastEconomicTickAt: state.lastEconomicTickAt,
        economicTickCounter: state.economicTickCounter,
        civilianPopulation: state.civilianPopulation,
      }),
    },
  ),
);
