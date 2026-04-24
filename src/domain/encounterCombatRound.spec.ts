import { describe, expect, it } from 'vitest';

import { DEFAULT_HEX_WALL_MAX_HP, HOME_HEX_ID } from './constants.ts';
import { createEmptyDailyDefense } from './factories/createDefenseSeed.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import type { HexMap } from './types/map.ts';
import {
  defenderLineForPrefeituraSiege,
  massDefenseSkillPickContext,
  normalizeMassDefenseDefenderLine,
  runEncounterCombatRound,
} from './encounterCombatRound.ts';

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

describe('encounterCombatRound', () => {
  it('normalizeMassDefenseDefenderLine fills tactical buckets', () => {
    const line = normalizeMassDefenseDefenderLine([
      {
        characterId: 'a',
        name: 'A',
        currentHp: 10,
        maxHp: 10,
        retreated: false,
      },
    ]);
    expect(line[0]!.tacticalBucket).toBe('front');
  });

  it('defenderLineForPrefeituraSiege clears retreat for living defenders', () => {
    const line = defenderLineForPrefeituraSiege([
      {
        characterId: 'a',
        name: 'A',
        currentHp: 10,
        maxHp: 10,
        retreated: true,
        tacticalBucket: 'front',
      },
    ]);
    expect(line[0]!.retreated).toBe(false);
  });

  it('runEncounterCombatRound nightly_wall increments turn and appends lines', () => {
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

    const hexMap = hexMapWithWallAt(HOME_HEX_ID);

    const r = runEncounterCombatRound({
      alliedStructures: [{ type: 'wall', hexId: HOME_HEX_ID }],
      daily,
      hexMap,
      rng: () => 0.55,
      defenderLine: [],
    });

    expect(r.nextDaily.currentTurn).toBe(1);
    expect(r.newLogLines.some((l) => l.text.includes('Nightly defense'))).toBe(
      true,
    );
    expect(r.wallResult.hexMap).toBeDefined();
  });

  it('massDefenseSkillPickContext uses endgame beat when hostiles are low', () => {
    const ctx = massDefenseSkillPickContext(
      2,
      false,
      [
        {
          enemyId: 'x',
          currentHealth: 2,
          maxHealth: 100,
          tacticalBucket: 'front',
          buffs: {},
        },
      ],
      [
        {
          characterId: 'c',
          name: 'Hero',
          currentHp: 40,
          maxHp: 40,
          retreated: false,
          tacticalBucket: 'front',
        },
      ],
      () => 0.5,
    );
    expect(ctx.combatBeatPhase).toBe('endgame');
    expect(ctx.defenderHpFraction).toBeLessThan(0.05);
  });

  it('defender autoplay logs catalog move name when skillIds present', () => {
    const base = createEmptyDailyDefense({ date: '2026-06-02' });
    const enemies = [
      {
        enemyId: 'grunt',
        currentHealth: 80,
        maxHealth: 80,
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

    const hexMap = hexMapWithWallAt(HOME_HEX_ID);

    const r = runEncounterCombatRound({
      alliedStructures: [{ type: 'wall', hexId: HOME_HEX_ID }],
      daily,
      hexMap,
      rng: () => 0.55,
      defenderLine: normalizeMassDefenseDefenderLine([
        {
          characterId: 'c1',
          name: 'Vega',
          currentHp: 30,
          maxHp: 30,
          retreated: false,
          tacticalBucket: 'front',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES },
          skillIds: ['basic_attack'],
        },
      ]),
    });

    const playerLines = r.newLogLines.filter((l) => l.type === 'player');
    expect(playerLines.some((l) => l.text.includes('Basic attack'))).toBe(
      true,
    );
  });
});
