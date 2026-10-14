import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createInitialCityCore } from '../domain/cityEconomy.ts';
import {
  INITIAL_CIVILIAN_POPULATION,
  PREFEITURA_TREASURY_INITIAL,
} from '../domain/constants.ts';
import { makeChronicleId } from '../domain/ids.ts';
import type { PassiveItemBuffer } from '../domain/types/economy.ts';
import type { CityCoreState } from '../domain/types/city.ts';
import type { ChronicleEntry } from '../domain/types/chronicle.ts';

interface CityActions {
  setCityCore: (cityCore: CityCoreState) => void;
  patchCityCore: (patch: Partial<CityCoreState>) => void;
  setLastEconomicTickAt: (t: number) => void;
  setCivilianPopulation: (n: number) => void;
  setEconomicTickCounter: (n: number) => void;
  setTreasury: (n: number) => void;
  setPantry: (pantry: PassiveItemBuffer) => void;
  setBrownoutThisWageDay: (brownoutThisWageDay: boolean) => void;
  appendChronicle: (text: string, atMs?: number) => void;
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
  /** Prefeitura creds. Untuned starting purse; this wave adds no income. */
  treasury: number;
  /** City stock of food, consumer goods, and the public-harvest tax. */
  pantry: PassiveItemBuffer;
  /** Set when a tick in the current wage day could not cover a power draw. */
  brownoutThisWageDay: boolean;
  /** Velho Rabiscão append-only intel log for this run. */
  chronicle: ChronicleEntry[];
} & CityActions;

function initialCityState(): Pick<
  CityStore,
  | 'cityCore'
  | 'lastEconomicTickAt'
  | 'economicTickCounter'
  | 'civilianPopulation'
  | 'treasury'
  | 'pantry'
  | 'brownoutThisWageDay'
  | 'chronicle'
> {
  const t = Date.now();
  return {
    cityCore: createInitialCityCore(),
    lastEconomicTickAt: t,
    economicTickCounter: 0,
    civilianPopulation: INITIAL_CIVILIAN_POPULATION,
    treasury: PREFEITURA_TREASURY_INITIAL,
    pantry: {},
    brownoutThisWageDay: false,
    chronicle: [],
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
      setTreasury: (treasury) => set({ treasury }),
      setPantry: (pantry) => set({ pantry }),
      setBrownoutThisWageDay: (brownoutThisWageDay) => set({ brownoutThisWageDay }),
      appendChronicle: (text, atMs) =>
        set((s) => {
          const at = atMs ?? Date.now();
          const entry: ChronicleEntry = {
            id: makeChronicleId(s.chronicle.length + 1),
            at,
            text,
          };
          return { chronicle: [...s.chronicle, entry] };
        }),
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
        treasury: state.treasury,
        pantry: state.pantry,
        brownoutThisWageDay: state.brownoutThisWageDay,
        chronicle: state.chronicle,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CityStore>;
        return {
          ...current,
          ...p,
          chronicle: Array.isArray(p.chronicle) ? p.chronicle : [],
        };
      },
    },
  ),
);
