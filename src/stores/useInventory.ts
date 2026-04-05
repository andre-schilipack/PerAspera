import type { Item } from '../domain/types/index.ts';

import { useCharactersStore } from './useCharactersStore.ts';

/** Items for the active character (empty if none selected). */
export function useCurrentInventory(): Item[] {
  return useCharactersStore((s) => {
    const id = s.currentCharacterId;
    if (!id) return [];
    return s.characters[id]?.inventory ?? [];
  });
}

export function useAddItemToCurrentInventory(): (item: Item) => void {
  const add = useCharactersStore((s) => s.addItemToInventory);
  const currentId = useCharactersStore((s) => s.currentCharacterId);
  return (item: Item) => {
    if (currentId) add(currentId, item);
  };
}

export function useRemoveItemFromCurrentInventory(): (itemId: string) => void {
  const remove = useCharactersStore((s) => s.removeItemFromInventory);
  const currentId = useCharactersStore((s) => s.currentCharacterId);
  return (itemId: string) => {
    if (currentId) remove(currentId, itemId);
  };
}
