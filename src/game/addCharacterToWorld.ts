import { HOME_HEX_ID } from '../domain/constants.ts';
import { createCharacter } from '../domain/factories/createCharacter.ts';
import { makeCharacterId } from '../domain/ids.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useSkirmishStore } from '../stores/useSkirmishStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

export type AddCharacterResult =
  | { ok: true; characterId: string }
  | { ok: false; error: string };

/**
 * Adds a new playable character to the existing shared map (does not replace the world).
 * Everyone starts at the shared parents' home hex ({@link HOME_HEX_ID}); the home slot on
 * that hex is seeded once in createInitialWorld. Future: aging may revoke this access per character.
 */
export function addCharacterToWorld(characterName: string): AddCharacterResult {
  const hexMap = useWorldStore.getState().hexMap;
  if (!hexMap) return { ok: false, error: 'No world loaded.' };
  if (!hexMap.hexes[HOME_HEX_ID]) {
    return { ok: false, error: 'Home hex missing from world.' };
  }

  const now = Date.now();
  const meta = useMetaStore.getState();
  const nextCharNum = meta.nextIds.character + 1;
  const charId = makeCharacterId(nextCharNum);

  const character = createCharacter({
    id: charId,
    name: characterName.trim() || 'Wanderer',
    homeHexId: HOME_HEX_ID,
    currentHexId: HOME_HEX_ID,
    nowMs: now,
  });

  useMetaStore.getState().patchNextIds({ character: nextCharNum });
  useCharactersStore.getState().upsertCharacter(character);
  useCharactersStore.getState().setCurrentCharacterId(charId);
  useSkirmishStore.getState().dismiss();

  return { ok: true, characterId: charId };
}
