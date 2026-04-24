import { describe, expect, it } from 'vitest';

import { DEFAULT_HEX_WALL_MAX_HP, HOME_HEX_ID } from './constants.ts';
import { createEmptyDailyDefense } from './factories/createDefenseSeed.ts';
import { advanceEncounterCombatRound } from './encounterCombat.ts';
import { runEncounterCombatRound } from './encounterCombatRound.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import type { HexMap } from './types/map.ts';

function hexMapWithWallAt(hexId: string): HexMap {
  return {
    size: 1,
    hexes: {
      [hexId]: {
        id: hexId,
        coordinates: { q: 0, r: 0 },
        danger: 0,
        integrity: 50,
        placeSlots: [],
        isUnlocked: true,
        features: [
          {
            type: 'wall',
            currentHp: DEFAULT_HEX_WALL_MAX_HP,
            maxHp: DEFAULT_HEX_WALL_MAX_HP,
          },
        ],
      },
    },
  };
}

describe('encounterCombat API', () => {
  it('advanceEncounterCombatRound matches runEncounterCombatRound for wall allied structure', () => {
    const base = createEmptyDailyDefense({ date: '2026-06-01' });
    const enemies = [
      {
        enemyId: 'grunt',
        currentHealth: 40,
        maxHealth: 40,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const daily = {
      ...base,
      phase: 'fighting' as const,
      outcome: 'active' as const,
      isCompleted: false,
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [],
    };

    const rng = () => 0.55;
    const hexMap = hexMapWithWallAt(HOME_HEX_ID);
    const wallStruct = [{ type: 'wall' as const, hexId: HOME_HEX_ID }];

    const direct = runEncounterCombatRound({
      alliedStructures: wallStruct,
      daily,
      hexMap,
      rng,
      defenderLine: [],
    });

    const unified = advanceEncounterCombatRound({
      rng,
      allies: [],
      enemies,
      alliedStructures: wallStruct,
      structures: { hexMap },
      session: { daily },
    });

    expect(unified.nextDaily.currentTurn).toBe(direct.nextDaily.currentTurn);
    expect(unified.fightEnded).toBe(direct.fightEnded);
    expect(unified.newLogLines.length).toBe(direct.newLogLines.length);
    expect(unified.wallResult.breached).toBe(direct.wallResult.breached);
  });
});
