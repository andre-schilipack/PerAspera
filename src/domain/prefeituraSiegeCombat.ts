import type { CombatLogEntry } from './types/combat.ts';
import type { DailyDefenseState } from './types/defense.ts';
import {
  massCombatStructuralPresencePrefeituraSiege,
  type MassCombatStructuralPresence,
} from './types/massCombat.ts';
import { CENTER_HEX_ID } from './constants.ts';
import type { HexMap } from './types/map.ts';

import type { NightlyCombatWallResult } from './nightlyDefenseCombat.ts';
import { advanceEncounterCombatRound } from './encounterCombat.ts';
import { applyEncounterCombatRoundToDaily } from './encounterCombatSessionMerge.ts';
import { defenderLineForPrefeituraSiege } from './encounterCombatRound.ts';

/** Downtown Prefeitura siege theater — structural + ally strikes (see mass combat types). */
export const PREFECTURE_SIEGE_STRUCTURAL_PRESENCE: MassCombatStructuralPresence =
  massCombatStructuralPresencePrefeituraSiege();

export interface AdvancePrefeituraSiegeResult {
  nextDaily: DailyDefenseState;
  wallResult: NightlyCombatWallResult;
  hexMap: HexMap;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
}

/**
 * **Encounter 2 (Prefeitura siege)** — downtown last stand after a wall-breach handoff
 * (see `defenseEncounterOrchestration.ts`). Tower, guards, defender melee vs enemies;
 * enemy strikes hit defenders and Prefeitura structural HP. Delegates to
 * `advanceEncounterCombatRound` (`encounterCombat.ts`).
 */
export function advancePrefeituraSiegeRound(
  daily: DailyDefenseState,
  hexMap: HexMap,
  rng: () => number,
): AdvancePrefeituraSiegeResult {
  const noop: AdvancePrefeituraSiegeResult = {
    nextDaily: daily,
    wallResult: { breached: false },
    fightEnded: false,
    newLogLines: [],
    hexMap,
  };

  if (
    daily.isCompleted ||
    daily.phase !== 'fighting' ||
    daily.outcome !== 'prefeitura_siege'
  ) {
    return noop;
  }

  if (daily.enemies.length === 0) {
    const roundTs = Date.now();
    return {
      nextDaily: {
        ...daily,
        isCompleted: true,
        phase: 'ended',
        outcome: 'victory',
        victoryLootPool: daily.victoryLootPool,
      },
      wallResult: { breached: false },
      fightEnded: true,
      newLogLines: [
        {
          turn: daily.currentTurn,
          timestamp: roundTs,
          text: 'No hostiles downtown — Prefeitura secured.',
          type: 'system',
        },
      ],
      hexMap,
    };
  }

  const preparedLine = defenderLineForPrefeituraSiege(daily.defenderLine);

  const r = advanceEncounterCombatRound({
    rng,
    allies: preparedLine,
    enemies: daily.enemies,
    alliedStructures: [{ type: 'city_hall', hexId: CENTER_HEX_ID }],
    sessionConfig: { noRetreat: true },
    structures: { hexMap },
    continuation: {
      currentTurn: daily.currentTurn,
      outcome: daily.outcome,
      phase: daily.phase,
      allySpirit: daily.allySpirit,
      moraleShockTurnsRemaining: daily.moraleShockTurnsRemaining,
    },
  });

  return {
    nextDaily: applyEncounterCombatRoundToDaily(daily, r.stateDelta),
    wallResult: r.wallResult,
    fightEnded: r.fightEnded,
    newLogLines: r.newLogLines,
    hexMap: r.hexMap ?? r.wallResult.hexMap ?? hexMap,
  };
}
