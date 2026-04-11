import {
  applyEconomicTicks,
  type EconomicTickSummary,
} from '../domain/cityEconomy.ts';
import {
  ECONOMIC_TICK_INTERVAL_MS,
  MAX_ECONOMIC_CATCH_UP_TICKS,
} from '../domain/constants.ts';
import { useCityStore } from '../stores/useCityStore.ts';

/**
 * Applies queued economic ticks since `lastEconomicTickAt` (e.g. on bootstrap).
 */
export function runEconomicCatchUp(nowMs: number): EconomicTickSummary {
  const { cityCore, lastEconomicTickAt, setCityCore, setLastEconomicTickAt } =
    useCityStore.getState();

  const elapsed = Math.max(0, nowMs - lastEconomicTickAt);
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

  const { core, summary } = applyEconomicTicks(cityCore, ticksToApply);
  setCityCore(core);
  setLastEconomicTickAt(lastEconomicTickAt + ticksToApply * ECONOMIC_TICK_INTERVAL_MS);

  return summary;
}
