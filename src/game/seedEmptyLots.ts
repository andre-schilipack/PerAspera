import {
  CENTER_HEX_ID,
  EMPTY_LOT_PRICE,
  HOME_HEX_ID,
  NPC_OWNER_CITY,
} from '../domain/constants.ts';
import { makeSlotId } from '../domain/ids.ts';
import type { HexMap, PlaceSlot } from '../domain/types/index.ts';

/**
 * Adds one purchasable empty slot per unlocked ring hex (city-owned).
 * Skips Centro (NPC services) and the starter home hex (house + historian).
 */
export function addEmptyPlaceSlotsToHexMap(
  hexMap: HexMap,
  slotIdCounter: number,
): { hexMap: HexMap; nextSlotId: number } {
  let n = slotIdCounter;
  const hexes = { ...hexMap.hexes };

  for (const hexId of Object.keys(hexes)) {
    if (hexId === CENTER_HEX_ID || hexId === HOME_HEX_ID) continue;
    const h = hexes[hexId];
    if (!h.isUnlocked) continue;

    const emptySlot: PlaceSlot = {
      id: makeSlotId(n++),
      hexId,
      ownedBy: NPC_OWNER_CITY,
      type: 'empty',
      priceToBuy: EMPTY_LOT_PRICE,
    };

    hexes[hexId] = {
      ...h,
      placeSlots: [...h.placeSlots, emptySlot],
    };
  }

  return {
    hexMap: { ...hexMap, hexes },
    nextSlotId: n,
  };
}
