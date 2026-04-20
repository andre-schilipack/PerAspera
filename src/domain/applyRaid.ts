import type { HexMap } from './types/map.ts';

export {
  applyRaidMarch,
  resolveRaidMarchTargetHex,
  buildHexRaidPath,
  type RaidMarchResult,
} from './raidMarch.ts';

import { applyRaidMarch } from './raidMarch.ts';

export type RaidResult = import('./raidMarch.ts').RaidMarchResult;

/** @deprecated Prefer {@link applyRaidMarch}; kept for callers using legacy param names. */
export function applyRaidFromRemainingThreat(params: {
  remainingThreatPoints: number;
  civilianPopulation: number;
  hexMap: HexMap;
  rng: () => number;
  targetHexId: string;
}) {
  return applyRaidMarch({
    threatCount: params.remainingThreatPoints,
    civilianPopulation: params.civilianPopulation,
    hexMap: params.hexMap,
    rng: params.rng,
    targetHexId: params.targetHexId,
  });
}
