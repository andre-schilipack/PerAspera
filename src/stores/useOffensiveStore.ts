import { create } from 'zustand';

import type { OffensiveSortieSession } from '../domain/types/offensive.ts';
import { startOffensiveSortie } from '../game/offensiveContracts.ts';

interface OffensiveStore {
  session: OffensiveSortieSession | null;
  startSortie: (contractId: string, nowMs?: number) => { ok: true } | { ok: false; error: string };
  dismiss: () => void;
}

export const useOffensiveStore = create<OffensiveStore>()((set) => ({
  session: null,

  startSortie: (contractId, nowMs = Date.now()) => {
    const result = startOffensiveSortie(contractId, nowMs);
    if (!result.ok) return result;
    set({ session: result.session });
    return { ok: true };
  },

  dismiss: () => set({ session: null }),
}));
