import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { normalizeCharacter } from '../domain/characterNormalize.ts';
import type { LegacyCharacterShape } from '../domain/characterNormalize.ts';
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
  /** Decrement stack by 1; removes the row when quantity reaches 0. */
  consumeOneUnitFromInventory: (characterId: string, itemId: string) => void;
  /** Remove up to `qty` units from one stack; returns units removed. */
  consumeQuantityFromInventory: (
    characterId: string,
    itemId: string,
    qty: number,
  ) => number;
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
      consumeOneUnitFromInventory: (characterId, itemId) =>
        set((s) => {
          const ch = s.characters[characterId];
          if (!ch) return s;
          const idx = ch.inventory.findIndex((i) => i.id === itemId);
          if (idx < 0) return s;
          const it = ch.inventory[idx];
          if (it.quantity <= 1) {
            const inventory = ch.inventory.filter((_, i) => i !== idx);
            return {
              characters: {
                ...s.characters,
                [characterId]: { ...ch, inventory },
              },
            };
          }
          const inventory = [...ch.inventory];
          inventory[idx] = { ...it, quantity: it.quantity - 1 };
          return {
            characters: {
              ...s.characters,
              [characterId]: { ...ch, inventory },
            },
          };
        }),
      consumeQuantityFromInventory: (characterId, itemId, qty) => {
        let removed = 0;
        set((s) => {
          const ch = s.characters[characterId];
          if (!ch) return s;
          const idx = ch.inventory.findIndex((i) => i.id === itemId);
          if (idx < 0) return s;
          const it = ch.inventory[idx];
          const take = Math.min(Math.max(0, qty), it.quantity);
          if (take <= 0) return s;
          removed = take;
          let inventory: Item[];
          if (it.quantity <= take) {
            inventory = ch.inventory.filter((_, i) => i !== idx);
          } else {
            inventory = [...ch.inventory];
            inventory[idx] = { ...it, quantity: it.quantity - take };
          }
          return {
            characters: {
              ...s.characters,
              [characterId]: { ...ch, inventory },
            },
          };
        });
        return removed;
      },
      reset: () => set(initialCharactersState()),
    }),
    {
      name: 'peraspera-characters',
      version: 1,
      migrate: (persistedState, fromVersion) => {
        if (fromVersion < 1 && persistedState && typeof persistedState === 'object') {
          const p = persistedState as Partial<CharactersState>;
          if (p.characters && typeof p.characters === 'object') {
            const next: Record<string, Character> = {};
            for (const [id, raw] of Object.entries(p.characters)) {
              next[id] = normalizeCharacter(raw as LegacyCharacterShape);
            }
            return { ...p, characters: next };
          }
        }
        return persistedState as CharactersState;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        characters: state.characters,
        currentCharacterId: state.currentCharacterId,
      }),
    },
  ),
);
