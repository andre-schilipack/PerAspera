import { create } from 'zustand';

import type { ExpansionClearOutcome } from '../domain/expansionClearBattle.ts';
import type { BattleReel } from '../domain/types/battleArchive.ts';

export interface ExpansionClearSession {
  contractId: string;
  targetHexId: string;
  outcome: ExpansionClearOutcome;
  reel: BattleReel;
}

interface ExpansionStore {
  session: ExpansionClearSession | null;
  openSession: (session: ExpansionClearSession) => void;
  dismiss: () => void;
}

export const useExpansionStore = create<ExpansionStore>()((set) => ({
  session: null,
  openSession: (session) => set({ session }),
  dismiss: () => set({ session: null }),
}));
