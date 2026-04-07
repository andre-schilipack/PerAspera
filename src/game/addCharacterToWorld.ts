import {
  CENTER_HEX_ID,
  HOME_HEX_ID,
  NPC_OWNER_CITY,
} from '../domain/constants.ts';
import { createCharacter } from '../domain/factories/createCharacter.ts';
import { makeCharacterId } from '../domain/ids.ts';
import type { HexMap } from '../domain/types/index.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useSkirmishStore } from '../stores/useSkirmishStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

function compareHexIds(a: string, b: string): number {
  const pa = a.split(',').map(Number);
  const pb = b.split(',').map(Number);
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  return pa[1] - pb[1];
}

/**
 * First city-owned empty lot on an unlocked hex, excluding Centro and the
 * canonical home hex (Velho Rabiscão). Deterministic order by axial key.
 */
export function findFirstEmptyCityLotForNewHome(
  hexMap: HexMap,
): { hexId: string; slotId: string } | null {
  const ids = Object.keys(hexMap.hexes)
    .filter((id) => id !== CENTER_HEX_ID && id !== HOME_HEX_ID)
    .sort(compareHexIds);
  for (const hexId of ids) {
    const hex = hexMap.hexes[hexId];
    if (!hex?.isUnlocked) continue;
    const slot = hex.placeSlots.find(
      (p) => p.type === 'empty' && p.ownedBy === NPC_OWNER_CITY,
    );
    if (slot) return { hexId, slotId: slot.id };
  }
  return null;
}

export type AddCharacterResult =
  | { ok: true; characterId: string }
  | { ok: false; error: string };

/**
 * Adds a new playable character to the existing shared map (does not replace the world).
 * Claims one empty ring lot and turns it into their home (no historian NPC there).
 */
export function addCharacterToWorld(characterName: string): AddCharacterResult {
  const hexMap = useWorldStore.getState().hexMap;
  if (!hexMap) return { ok: false, error: 'No world loaded.' };

  const found = findFirstEmptyCityLotForNewHome(hexMap);
  if (!found) {
    return {
      ok: false,
      error: 'No empty city lots for a new home. Clear the ring or use another save.',
    };
  }

  const now = Date.now();
  const meta = useMetaStore.getState();
  const nextCharNum = meta.nextIds.character + 1;
  const charId = makeCharacterId(nextCharNum);

  const character = createCharacter({
    id: charId,
    name: characterName.trim() || 'Wanderer',
    homeHexId: found.hexId,
    currentHexId: found.hexId,
    nowMs: now,
  });

  useWorldStore.getState().updateHex(found.hexId, (h) => ({
    ...h,
    placeSlots: h.placeSlots.map((p) =>
      p.id === found.slotId
        ? {
            ...p,
            ownedBy: charId,
            type: 'home' as const,
            priceToBuy: 0,
          }
        : p,
    ),
  }));

  useMetaStore.getState().patchNextIds({ character: nextCharNum });
  useCharactersStore.getState().upsertCharacter(character);
  useCharactersStore.getState().setCurrentCharacterId(charId);
  useSkirmishStore.getState().dismiss();

  return { ok: true, characterId: charId };
}
