import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Character, Item } from '../domain/types/index.ts';

interface CharactersActions {
  setCurrentCharacterId: (id: string | null) => void;
  upsertCharacter: (character: Character) => void;
  removeCharacter: (characterId: string) => void;
  updateCharacter: (
    characterId: string,
    patch: Partial<Character>,
  ) => void;
  addItemToInventory: (characterId: string, item: Item) => void;
  removeItemFromInventory: (characterId: string, itemId: string) => void;
  reset: () => void;
}

type CharactersState = {
  characters: Record<string, Character>;
  currentCharacterId: string | null;
};

type CharactersStore = CharactersState & CharactersActions;

const initialCharactersState = (): CharactersState => ({
  characters: {},
  currentCharacterId: null,
});

export const useCharactersStore = create<CharactersStore>()(
  persist(
    (set) => ({
      ...initialCharactersState(),
      setCurrentCharacterId: (currentCharacterId) => set({ currentCharacterId }),
      upsertCharacter: (character) =>
        set((s) => ({
          characters: { ...s.characters, [character.id]: character },
        })),
      removeCharacter: (characterId) =>
        set((s) => {
          const next = { ...s.characters };
          delete next[characterId];
          return {
            characters: next,
            currentCharacterId:
              s.currentCharacterId === characterId
                ? null
                : s.currentCharacterId,
          };
        }),
      updateCharacter: (characterId, patch) =>
        set((s) => {
          const prev = s.characters[characterId];
          if (!prev) return s;
          return {
            characters: {
              ...s.characters,
              [characterId]: { ...prev, ...patch },
            },
          };
        }),
      addItemToInventory: (characterId, item) =>
        set((s) => {
          const ch = s.characters[characterId];
          if (!ch) return s;
          return {
            characters: {
              ...s.characters,
              [characterId]: {
                ...ch,
                inventory: [...ch.inventory, item],
              },
            },
          };
        }),
      removeItemFromInventory: (characterId, itemId) =>
        set((s) => {
          const ch = s.characters[characterId];
          if (!ch) return s;
          const idx = ch.inventory.findIndex((i) => i.id === itemId);
          if (idx < 0) return s;
          const inventory = [...ch.inventory];
          inventory.splice(idx, 1);
          return {
            characters: {
              ...s.characters,
              [characterId]: { ...ch, inventory },
            },
          };
        }),
      reset: () => set(initialCharactersState()),
    }),
    {
      name: 'peraspera-characters',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        characters: state.characters,
        currentCharacterId: state.currentCharacterId,
      }),
    },
  ),
);
