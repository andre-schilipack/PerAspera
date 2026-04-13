import {
  EMPTY_LOT_PRICE,
  NPC_OWNER_CITY,
  RAID_CIVILIANS_PER_THREAT_POINT,
  RAID_THREAT_PER_BUSINESS,
} from './constants.ts';
import type { HexMap } from './types/map.ts';

export interface RaidResult {
  civilianPopulation: number;
  hexMap: HexMap;
  logLines: string[];
}

/**
 * After a wall breach, remaining threat points raid the city: population loss
 * and business slots destroyed until threat is "spent".
 */
export function applyRaidFromRemainingThreat(params: {
  remainingThreatPoints: number;
  civilianPopulation: number;
  hexMap: HexMap;
  rng: () => number;
}): RaidResult {
  let pop = Math.max(0, params.civilianPopulation);
  let threat = Math.max(0, params.remainingThreatPoints);
  const logLines: string[] = [];
  const rng = params.rng;

  if (threat <= 0) {
    return {
      civilianPopulation: pop,
      hexMap: params.hexMap,
      logLines: [],
    };
  }

  const popLoss = Math.min(
    pop,
    Math.floor(threat * RAID_CIVILIANS_PER_THREAT_POINT),
  );
  pop -= popLoss;
  if (popLoss > 0) {
    logLines.push(`Raid: ${String(popLoss)} civilians lost in the breach.`);
  }

  let hexMap = params.hexMap;
  const businessTargets: { hexId: string; slotId: string }[] = [];
  for (const hexId of Object.keys(hexMap.hexes)) {
    const hex = hexMap.hexes[hexId]!;
    for (const slot of hex.placeSlots) {
      if (slot.type === 'business' && slot.business) {
        businessTargets.push({ hexId, slotId: slot.id });
      }
    }
  }

  while (threat >= RAID_THREAT_PER_BUSINESS && businessTargets.length > 0) {
    const idx = Math.floor(rng() * businessTargets.length);
    const pick = businessTargets[idx]!;
    businessTargets.splice(idx, 1);
    threat -= RAID_THREAT_PER_BUSINESS;

    const hex = hexMap.hexes[pick.hexId]!;
    hexMap = {
      ...hexMap,
      hexes: {
        ...hexMap.hexes,
        [pick.hexId]: {
          ...hex,
          placeSlots: hex.placeSlots.map((p) =>
            p.id === pick.slotId && p.type === 'business'
              ? {
                  ...p,
                  type: 'empty' as const,
                  business: undefined,
                  ownedBy: NPC_OWNER_CITY,
                  priceToBuy: EMPTY_LOT_PRICE,
                }
              : p,
          ),
        },
      },
    };
    logLines.push(
      `Raid: a business at ${pick.hexId} was destroyed (${String(RAID_THREAT_PER_BUSINESS)} threat).`,
    );
  }

  if (threat > 0) {
    logLines.push(
      `Raid ends with ${String(threat)} threat points of chaos still roaming.`,
    );
  }

  return { civilianPopulation: pop, hexMap, logLines };
}
