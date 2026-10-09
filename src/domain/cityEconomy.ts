import { CITY_POWER_MAX, CITY_POWER_START } from './constants.ts';
import type { CityCoreState } from './types/city.ts';

export interface EconomicTickSummary {
  ticksApplied: number;
  energyDeltaTotal: number;
  brownoutTicks: number;
  stabilityLostTotal: number;
}

export function createInitialCityCore(): CityCoreState {
  return {
    energyCurrent: CITY_POWER_START,
    energyMax: CITY_POWER_MAX,
    energyGenerationPerTick: 0,
    energyConsumptionPerTick: 0,
    stabilityIndex: 72.25,
  };
}

function clampEnergy(core: CityCoreState): CityCoreState {
  const max = Math.max(0, core.energyMax);
  const cur = Math.min(max, Math.max(0, core.energyCurrent));
  return { ...core, energyMax: max, energyCurrent: cur };
}

function clampStability(s: number): number {
  return Math.min(100, Math.max(0, s));
}

/**
 * One economic simulation step (30 min real-time cadence).
 */
export function applySingleEconomicTick(core: CityCoreState): CityCoreState {
  let next = { ...core };
  const net =
    next.energyGenerationPerTick - next.energyConsumptionPerTick;
  next.energyCurrent = next.energyCurrent + net;
  next = clampEnergy(next);

  if (next.energyCurrent <= 0.000_001) {
    const loss = 0.35;
    next.stabilityIndex = clampStability(next.stabilityIndex - loss);
  }

  return next;
}

/**
 * Apply `tickCount` deterministic ticks in sequence.
 */
export function applyEconomicTicks(
  core: CityCoreState,
  tickCount: number,
): { core: CityCoreState; summary: EconomicTickSummary } {
  if (tickCount <= 0) {
    return {
      core,
      summary: {
        ticksApplied: 0,
        energyDeltaTotal: 0,
        brownoutTicks: 0,
        stabilityLostTotal: 0,
      },
    };
  }

  let c = core;
  const startEnergy = c.energyCurrent;
  const stabilityStart = c.stabilityIndex;
  let brownoutTicks = 0;

  for (let i = 0; i < tickCount; i++) {
    c = applySingleEconomicTick(c);
    if (c.energyCurrent <= 0.000_001) {
      brownoutTicks += 1;
    }
  }

  return {
    core: c,
    summary: {
      ticksApplied: tickCount,
      energyDeltaTotal: c.energyCurrent - startEnergy,
      brownoutTicks,
      stabilityLostTotal: stabilityStart - c.stabilityIndex,
    },
  };
}
