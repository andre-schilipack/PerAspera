import { create } from 'zustand';

import {
  STREET_SKIRMISH_WIN_CREDS,
  STREET_SKIRMISH_WIN_SCORE,
} from '../domain/constants.ts';
import {
  advanceStreetSkirmishRound,
  createStreetSkirmish,
  type CreateStreetSkirmishParams,
} from '../domain/streetSkirmish.ts';
import type { CombatLogEntry } from '../domain/types/index.ts';
import type { StreetSkirmishState } from '../domain/types/skirmish.ts';
import { useCharactersStore } from './useCharactersStore.ts';
import { useMetaStore } from './useMetaStore.ts';

interface SkirmishActions {
  startFromPatrol: (params: CreateStreetSkirmishParams) => void;
  /** One round of player + enemy actions. */
  advanceRound: () => void;
  /** Close modal and drop volatile session. */
  dismiss: () => void;
}

type SkirmishStore = {
  session: StreetSkirmishState | null;
} & SkirmishActions;

function assignLogIds(
  lines: Omit<CombatLogEntry, 'id'>[],
  startId: number,
): CombatLogEntry[] {
  return lines.map((line, i) => ({ ...line, id: startId + i }));
}

export const useSkirmishStore = create<SkirmishStore>()((set, get) => ({
  session: null,

  startFromPatrol: (params) => {
    const initial = createStreetSkirmish(params);
    const meta = useMetaStore.getState();
    const openId = meta.nextIds.combatLogEntry + 1;
    useMetaStore.getState().patchNextIds({ combatLogEntry: openId });
    const opening: CombatLogEntry = {
      id: openId,
      turn: 0,
      timestamp: Date.now(),
      text: 'Rust and eyes — something wants your creds.',
      type: 'system',
    };
    set({ session: { ...initial, combatLog: [opening] } });
  },

  advanceRound: () => {
    const s = get().session;
    if (!s || s.isCompleted) return;

    const { next, newLogLines } = advanceStreetSkirmishRound(s);
    const meta = useMetaStore.getState();
    let withIdsFinal: CombatLogEntry[] = [];
    if (newLogLines.length > 0) {
      const startId = meta.nextIds.combatLogEntry + 1;
      withIdsFinal = assignLogIds(newLogLines, startId);
      const lastId = startId + withIdsFinal.length - 1;
      useMetaStore.getState().patchNextIds({ combatLogEntry: lastId });
    }

    const mergedLog = [...next.combatLog, ...withIdsFinal];

    if (next.outcome === 'win' && next.isCompleted) {
      const ch = useCharactersStore.getState().characters[next.characterId];
      if (ch) {
        useCharactersStore.getState().updateCharacter(next.characterId, {
          creds: ch.creds + STREET_SKIRMISH_WIN_CREDS,
          score: ch.score + STREET_SKIRMISH_WIN_SCORE,
        });
      }
    }

    set({
      session: {
        ...next,
        combatLog: mergedLog,
      },
    });
  },

  dismiss: () => set({ session: null }),
}));
