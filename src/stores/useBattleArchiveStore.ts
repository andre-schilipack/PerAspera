import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { BATTLE_ARCHIVE_CAP } from '../domain/constants.ts';
import type { BattleArchiveEntry, BattleReel } from '../domain/types/battleArchive.ts';

interface BattleArchiveStore {
  nextId: number;
  entries: BattleArchiveEntry[];
  append: (reel: BattleReel) => number;
  markSeen: (entryId: number, characterId: string) => void;
  reset: () => void;
}

export const useBattleArchiveStore = create<BattleArchiveStore>()(
  persist(
    (set, get) => ({
      nextId: 0,
      entries: [],

      append: (reel) => {
        const id = get().nextId + 1;
        const entry: BattleArchiveEntry = {
          ...reel,
          id,
          seenByCharacterIds: [],
        };
        set((state) => ({
          nextId: id,
          entries: [...state.entries, entry].slice(-BATTLE_ARCHIVE_CAP),
        }));
        return id;
      },

      markSeen: (entryId, characterId) =>
        set((state) => ({
          entries: state.entries.map((entry) => {
            if (entry.id !== entryId) return entry;
            if (entry.seenByCharacterIds.includes(characterId)) return entry;
            return {
              ...entry,
              seenByCharacterIds: [...entry.seenByCharacterIds, characterId],
            };
          }),
        })),

      reset: () => set({ nextId: 0, entries: [] }),
    }),
    {
      name: 'peraspera-battle-archive',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        nextId: state.nextId,
        entries: state.entries,
      }),
    },
  ),
);
