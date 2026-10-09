import { displayEconomicIncreasing } from './economicDisplay.ts';
import { normalizeBusiness } from './businessEconomyTick.ts';
import type { Character } from './types/character.ts';
import type { HexMap } from './types/map.ts';

/**
 * Alpha `loja` lots become owned empty lots. Pending shop creds are paid once.
 * Other legacy kinds are normalized in place.
 */
export function migrateLegacyBusinessSlots(
  hexMap: HexMap,
  characters: Record<string, Character>,
): { hexMap: HexMap; characters: Record<string, Character> } {
  let nextChars = { ...characters };
  const hexes = { ...hexMap.hexes };
  for (const hexId of Object.keys(hexes)) {
    const hex = hexes[hexId];
    let changed = false;
    const placeSlots = hex.placeSlots.map((slot) => {
      if (slot.type !== 'business' || !slot.business) return slot;
      const raw = slot.business as unknown as { type?: string; credsPending?: number; buildingId?: string };
      if (raw.buildingId) {
        return { ...slot, business: normalizeBusiness(slot.business) };
      }
      changed = true;
      if (raw.type === 'loja') {
        const pay = displayEconomicIncreasing(raw.credsPending ?? 0);
        const owner = nextChars[slot.ownedBy];
        if (owner && pay > 0) {
          nextChars = {
            ...nextChars,
            [slot.ownedBy]: { ...owner, creds: owner.creds + pay },
          };
        }
        return {
          ...slot,
          type: 'empty' as const,
          business: undefined,
          priceToBuy: 0,
        };
      }
      return { ...slot, business: normalizeBusiness(slot.business) };
    });
    if (changed) hexes[hexId] = { ...hex, placeSlots };
  }
  return { hexMap: { ...hexMap, hexes }, characters: nextChars };
}
