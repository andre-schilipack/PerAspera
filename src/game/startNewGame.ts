import { GAME_VERSION, HOME_HEX_ID } from '../domain/constants.ts';
import { createCharacter } from '../domain/factories/createCharacter.ts';
import { createInitialWorld } from '../domain/factories/createInitialWorld.ts';
import { makeCharacterId } from '../domain/ids.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useSkirmishStore } from '../stores/useSkirmishStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';
import { addEmptyPlaceSlotsToHexMap } from './seedEmptyLots.ts';

/**
 * Wipes defense/world optional — here we only set fresh world + one character.
 * Resets meta scoreboard but keeps schema version.
 */
export function startNewGame(characterName: string): void {
  const now = Date.now();
  useMetaStore.getState().clearGameOver();
  useCharactersStore.getState().reset();
  const meta = useMetaStore.getState();
  const nextCharNum = meta.nextIds.character + 1;
  const charId = makeCharacterId(nextCharNum);
  const slotStart = meta.nextIds.placeSlot + 1;

  const worldResult = createInitialWorld({
    slotIdCounter: slotStart,
  });

  const withLots = addEmptyPlaceSlotsToHexMap(
    worldResult.hexMap,
    worldResult.nextSlotId,
  );

  const character = createCharacter({
    id: charId,
    name: characterName.trim() || 'Wanderer',
    homeHexId: HOME_HEX_ID,
    currentHexId: HOME_HEX_ID,
    nowMs: now,
  });

  useMetaStore.getState().patchNextIds({
    character: nextCharNum,
    placeSlot: withLots.nextSlotId - 1,
  });
  useMetaStore.getState().setVersion(GAME_VERSION);
  useMetaStore.getState().setCreatedAt(now);
  useMetaStore.getState().replaceGlobalScoreboard([]);

  useCharactersStore.getState().upsertCharacter(character);
  useCharactersStore.getState().setCurrentCharacterId(charId);

  useWorldStore.getState().setHexMap(withLots.hexMap);

  useDefenseStore.getState().reset();
  useCityStore.getState().reset();
  useContractsStore.getState().reset();
  useSkirmishStore.getState().dismiss();
}
