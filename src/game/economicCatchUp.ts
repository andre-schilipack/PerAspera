import {
  applyPassiveBuffersOneTick,
  applyPayrollForWageDay,
} from '../domain/businessEconomyTick.ts';
import {
  applySingleEconomicTick,
  type EconomicTickSummary,
} from '../domain/cityEconomy.ts';
import {
  ECONOMIC_TICK_INTERVAL_MS,
  ECONOMIC_TICKS_PER_WAGE_DAY,
  INITIAL_CIVILIAN_POPULATION,
  MAX_ECONOMIC_CATCH_UP_TICKS,
} from '../domain/constants.ts';
import type { Character } from '../domain/types/index.ts';
import type { HexMap } from '../domain/types/index.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

/**
 * Applies queued economic ticks since `lastEconomicTickAt` (e.g. on bootstrap).
 */
export function runEconomicCatchUp(nowMs: number): EconomicTickSummary {
  const city = useCityStore.getState();
  let cityCore = city.cityCore;
  const lastAt = city.lastEconomicTickAt;
  let economicTickCounter = city.economicTickCounter ?? 0;
  const civilianPopulation =
    city.civilianPopulation ?? INITIAL_CIVILIAN_POPULATION;

  const elapsed = Math.max(0, nowMs - lastAt);
  const rawTicks = Math.floor(elapsed / ECONOMIC_TICK_INTERVAL_MS);
  const ticksToApply = Math.min(rawTicks, MAX_ECONOMIC_CATCH_UP_TICKS);

  if (ticksToApply <= 0) {
    return {
      ticksApplied: 0,
      energyDeltaTotal: 0,
      brownoutTicks: 0,
      stabilityLostTotal: 0,
    };
  }

  const startEnergy = cityCore.energyCurrent;
  const stabilityStart = cityCore.stabilityIndex;
  let brownoutTicks = 0;

  let hexMap: HexMap | null = useWorldStore.getState().hexMap;
  const startCharactersSnapshot: Record<string, Character> = {
    ...useCharactersStore.getState().characters,
  };
  let characters: Record<string, Character> = {
    ...startCharactersSnapshot,
  };

  for (let i = 0; i < ticksToApply; i++) {
    cityCore = applySingleEconomicTick(cityCore);
    if (cityCore.energyCurrent <= 0.000_001) {
      brownoutTicks += 1;
    }

    economicTickCounter += 1;

    if (hexMap) {
      if (economicTickCounter % ECONOMIC_TICKS_PER_WAGE_DAY === 0) {
        const r = applyPayrollForWageDay(hexMap, characters);
        hexMap = r.hexMap;
        characters = r.characters;
      }
      hexMap = applyPassiveBuffersOneTick(hexMap);
    }
  }

  useCityStore.setState({
    cityCore,
    lastEconomicTickAt: lastAt + ticksToApply * ECONOMIC_TICK_INTERVAL_MS,
    economicTickCounter,
    civilianPopulation,
  });

  if (hexMap) {
    useWorldStore.setState({ hexMap });
  }

  const updateCharacter = useCharactersStore.getState().updateCharacter;
  for (const id of Object.keys(characters)) {
    const ch = characters[id];
    const was = startCharactersSnapshot[id];
    if (!ch) continue;
    if (!was || was.creds !== ch.creds) {
      updateCharacter(id, { creds: ch.creds });
    }
  }

  return {
    ticksApplied: ticksToApply,
    energyDeltaTotal: cityCore.energyCurrent - startEnergy,
    brownoutTicks,
    stabilityLostTotal: stabilityStart - cityCore.stabilityIndex,
  };
}
