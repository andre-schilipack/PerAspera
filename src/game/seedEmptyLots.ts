import { EMPTY_LOT_PRICE, NPC_OWNER_CITY } from '../domain/constants.ts';
import { hexKeyFromAxial } from '../domain/hex.ts';
import { makeSlotId } from '../domain/ids.ts';
import type { HexMap, PlaceSlot } from '../domain/types/index.ts';

const CENTER_HEX = hexKeyFromAxial(0, 0);

/**
 * Adds one purchasable empty slot per unlocked non-center hex (city-owned).
 */
export function addEmptyPlaceSlotsToHexMap(
  hexMap: HexMap,
  slotIdCounter: number,
): { hexMap: HexMap; nextSlotId: number } {
  let n = slotIdCounter;
  const hexes = { ...hexMap.hexes };

  for (const hexId of Object.keys(hexes)) {
    if (hexId === CENTER_HEX) continue;
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
