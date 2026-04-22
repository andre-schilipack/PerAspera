import type { CombatLogEntry } from './types/combat.ts';
import type {
  DailyDefenseState,
  WallState,
} from './types/defense.ts';
import {
  massCombatStructuralPresencePrefeituraSiege,
  type MassCombatStructuralPresence,
} from './types/massCombat.ts';
import type { HexMap } from './types/map.ts';

import type { NightlyCombatWallResult } from './nightlyDefenseCombat.ts';
import {
  defenderLineForPrefeituraSiege,
  runMassDefenseCombatRound,
} from './massDefenseRound.ts';

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
 * Downtown last stand: tower, guards, defender melee vs enemies; enemy strikes hit
 * defenders and Prefeitura structural HP. Delegates to {@link runMassDefenseCombatRound}.
 */
export function advancePrefeituraSiegeRound(
  daily: DailyDefenseState,
  wall: WallState,
  hexMap: HexMap,
  rng: () => number,
): AdvancePrefeituraSiegeResult {
  const noop: AdvancePrefeituraSiegeResult = {
    nextDaily: daily,
    wallResult: { wall, breached: false },
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
      wallResult: { wall, breached: false },
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

  const r = runMassDefenseCombatRound({
    structureMode: 'prefeitura_siege',
    daily,
    wall,
    rng,
    defenderLine: preparedLine,
    hexMap,
  });

  return {
    nextDaily: r.nextDaily,
    wallResult: r.wallResult,
    fightEnded: r.fightEnded,
    newLogLines: r.newLogLines,
    hexMap: r.hexMap ?? hexMap,
  };
}
