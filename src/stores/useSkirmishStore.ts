import { create } from 'zustand';

import {
  STREET_SKIRMISH_SCRAP_REWARD_QTY,
  STREET_SKIRMISH_WIN_SCORE,
} from '../domain/constants.ts';
import { itemGrantTemplate } from '../domain/businessPayout.ts';
import { algoProgramFromLoadout } from '../domain/combat/ai/algoProgram.ts';
import {
  runStreetSkirmish,
  type RunStreetSkirmishParams,
} from '../domain/streetSkirmish.ts';
import type { Item } from '../domain/types/index.ts';
import type { StreetSkirmishSession } from '../domain/types/skirmish.ts';
import { useCharactersStore } from './useCharactersStore.ts';
import { useMetaStore } from './useMetaStore.ts';

interface SkirmishStore {
  session: StreetSkirmishSession | null;
  /**
   * Start a 1v1 street fight: resolves the full battle immediately, then UI plays back.
   */
  startFromPatrol: (
    params: Omit<RunStreetSkirmishParams, 'firstLogId' | 'battleId'> & {
      battleId?: string;
    },
  ) => void;
  /** Sync final HP to character and clear volatile session. */
  dismiss: () => void;
}

function applyWinRewards(session: StreetSkirmishSession): void {
  const ch = useCharactersStore.getState().characters[session.characterId];
  if (!ch) return;
  const stub = itemGrantTemplate('scrap_metal');
  if (stub) {
    const scrap: Item = {
      id: `scrap_metal_skirmish_${String(Date.now())}`,
      templateId: stub.templateId,
      name: stub.name,
      type: stub.type,
      rarity: stub.rarity,
      value: stub.value,
      effects: { ...stub.effects },
      quantity: STREET_SKIRMISH_SCRAP_REWARD_QTY,
    };
    useCharactersStore.getState().addItemToInventory(session.characterId, scrap);
  }
  useCharactersStore.getState().updateCharacter(session.characterId, {
    score: ch.score + STREET_SKIRMISH_WIN_SCORE,
  });
}

export const useSkirmishStore = create<SkirmishStore>()((set, get) => ({
  session: null,

  startFromPatrol: (params) => {
    const ch = useCharactersStore.getState().characters[params.characterId];
    const meta = useMetaStore.getState();
    const firstLogId = meta.nextIds.combatLogEntry + 1;

    const session = runStreetSkirmish({
      ...params,
      battleId: params.battleId ?? `street-${params.hexId}-${String(Date.now())}`,
      firstLogId,
      playerHealth: params.playerHealth ?? ch?.health?.current ?? 1,
      playerMaxHealth: params.playerMaxHealth ?? ch?.health?.max ?? 1,
      coreAttributes: params.coreAttributes ?? ch?.coreAttributes,
      skillIds: params.skillIds ?? ch?.combatLoadout?.skillIds,
      combatRole: params.combatRole ?? ch?.combatLoadout?.combatRole,
      algoProgram:
        params.algoProgram ?? algoProgramFromLoadout(ch?.combatLoadout),
    });

    const lastId =
      session.combatLog.length > 0
        ? session.combatLog[session.combatLog.length - 1]!.id
        : firstLogId;
    useMetaStore.getState().patchNextIds({ combatLogEntry: lastId });

    if (session.outcome === 'win') {
      applyWinRewards(session);
      session.rewardsApplied = true;
    }

    set({ session });
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
    set({ session: null });
  },
}));
