import { create } from 'zustand';

import {
  STREET_SKIRMISH_SCRAP_REWARD_QTY,
  STREET_SKIRMISH_WIN_SCORE,
} from '../domain/constants.ts';
import { itemGrantTemplate } from '../domain/businessPayout.ts';
import {
  advanceStreetSkirmishRound,
  createStreetSkirmish,
  type CreateStreetSkirmishParams,
} from '../domain/streetSkirmish.ts';
import type { CombatLogEntry, Item } from '../domain/types/index.ts';
import type {
  StreetSkirmishPhase,
  StreetSkirmishState,
} from '../domain/types/skirmish.ts';
import { useCharactersStore } from './useCharactersStore.ts';
import { useMetaStore } from './useMetaStore.ts';

interface SkirmishActions {
  startFromPatrol: (params: CreateStreetSkirmishParams) => void;
  setPhase: (phase: StreetSkirmishPhase) => void;
  /** One round of player + enemy actions. */
  advanceRound: () => void;
  /** Per-skirmish consumable (e.g. spray) — templateId already used this fight. */
  markSkirmishConsumableUsed: (templateId: string) => void;
  /** Close modal, sync HP to character, drop volatile session. */
  dismiss: () => void;
}

type SkirmishStore = {
  session: StreetSkirmishState | null;
  /** templateId → used (spray de contusão, 1 per street skirmish). */
  perSkirmishConsumableUsed: Record<string, boolean>;
} & SkirmishActions;

function assignLogIds(
  lines: Omit<CombatLogEntry, 'id'>[],
  startId: number,
): CombatLogEntry[] {
  return lines.map((line, i) => ({ ...line, id: startId + i }));
}

export const useSkirmishStore = create<SkirmishStore>()((set, get) => ({
  session: null,
  perSkirmishConsumableUsed: {},

  startFromPatrol: (params) => {
    const ch = useCharactersStore.getState().characters[params.characterId];
    const initial = createStreetSkirmish({
      ...params,
      playerHealth: ch?.health?.current,
      playerMaxHealth: ch?.health?.max,
    });
    const meta = useMetaStore.getState();
    const openId = meta.nextIds.combatLogEntry + 1;
    useMetaStore.getState().patchNextIds({ combatLogEntry: openId });
    const opening: CombatLogEntry = {
      id: openId,
      turn: 0,
      timestamp: Date.now(),
      text: 'Rust and eyes — something steps out of the dark.',
      type: 'system',
    };
    set({
      session: { ...initial, combatLog: [opening] },
      perSkirmishConsumableUsed: {},
    });
  },

  markSkirmishConsumableUsed: (templateId) =>
    set((s) => ({
      perSkirmishConsumableUsed: {
        ...s.perSkirmishConsumableUsed,
        [templateId]: true,
      },
    })),

  setPhase: (phase) => {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, phase } });
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
        const stub = itemGrantTemplate('scrap_metal');
        if (stub) {
          const scrap: Item = {
            id: `scrap_metal_skirmish_${Date.now()}`,
            templateId: stub.templateId,
            name: stub.name,
            type: stub.type,
            rarity: stub.rarity,
            value: stub.value,
            effects: { ...stub.effects },
            quantity: STREET_SKIRMISH_SCRAP_REWARD_QTY,
          };
          useCharactersStore.getState().addItemToInventory(next.characterId, scrap);
        }
        useCharactersStore.getState().updateCharacter(next.characterId, {
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

  dismiss: () => {
    const s = get().session;
    if (s) {
      const ch = useCharactersStore.getState().characters[s.characterId];
      if (ch) {
        useCharactersStore.getState().updateCharacter(s.characterId, {
          health: {
            current: Math.min(s.playerMaxHealth, Math.max(0, s.playerHealth)),
            max: s.playerMaxHealth,
            lastUpdated: Date.now(),
          },
        });
      }
    }
    set({ session: null, perSkirmishConsumableUsed: {} });
  },
}));
