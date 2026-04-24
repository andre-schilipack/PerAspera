import { describe, expect, it } from 'vitest';

import { DEFAULT_HEX_WALL_MAX_HP, HOME_HEX_ID } from './constants.ts';
import { createEmptyDailyDefense } from './factories/createDefenseSeed.ts';
import { advanceNightlyDefenseRound } from './nightlyDefenseCombat.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import type { DailyDefenseState } from './types/defense.ts';
import type { HexMap } from './types/map.ts';

function fightingWallDaily(
  overrides: Partial<DailyDefenseState> = {},
): DailyDefenseState {
  const d = createEmptyDailyDefense({ date: '2026-07-01' });
  return {
    ...d,
    phase: 'fighting',
    outcome: 'active',
    isCompleted: false,
    ...overrides,
  };
}

function hexMapWithWallHp(hexId: string, currentHp: number, maxHp: number): HexMap {
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
        features: [{ type: 'wall', currentHp, maxHp }],
      },
    },
  };
}

describe('nightly defense regression (domain)', () => {
  it('instant victory log when wave is empty before round', () => {
    const daily = fightingWallDaily({
      enemies: [],
      totalEnemyPoints: 0,
    });
    const hexMap = hexMapWithWallHp(HOME_HEX_ID, DEFAULT_HEX_WALL_MAX_HP, DEFAULT_HEX_WALL_MAX_HP);
    const r = advanceNightlyDefenseRound(daily, hexMap, () => 0.5);
    expect(r.fightEnded).toBe(true);
    expect(r.nextDaily.outcome).toBe('victory');
    expect(r.newLogLines.some((l) => l.text.includes('stands down'))).toBe(true);
  });

  it('clears wave in one round when lone enemy has 1 HP (RNG high)', () => {
    const enemies = [
      {
        enemyId: 'squish',
        currentHealth: 1,
        maxHealth: 99,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const daily = fightingWallDaily({
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [],
    });
    const hexMap = hexMapWithWallHp(HOME_HEX_ID, DEFAULT_HEX_WALL_MAX_HP, DEFAULT_HEX_WALL_MAX_HP);
    const r = advanceNightlyDefenseRound(daily, hexMap, () => 0.999);
    expect(r.fightEnded).toBe(true);
    expect(r.nextDaily.outcome).toBe('victory');
    expect(r.nextDaily.enemies.length).toBe(0);
  });

  it('breaches thin wall when strike cycle is wall-only and hostile hits hard', () => {
    const enemies = [
      {
        enemyId: 'ram',
        currentHealth: 500,
        maxHealth: 500,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const daily = fightingWallDaily({
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [],
    });
    const hexMap = hexMapWithWallHp(HOME_HEX_ID, 4, 400);
    const r = advanceNightlyDefenseRound(daily, hexMap, () => 0.95);
    expect(r.wallResult.breached).toBe(true);
    expect(r.nextDaily.outcome).toBe('breach');
    expect(r.fightEnded).toBe(true);
  });

  it('does not throw with extreme low RNG stream', () => {
    let i = 0;
    const enemies = [
      {
        enemyId: 'z',
        currentHealth: 40,
        maxHealth: 40,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const daily = fightingWallDaily({
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [],
    });
    const hexMap = hexMapWithWallHp(HOME_HEX_ID, DEFAULT_HEX_WALL_MAX_HP, DEFAULT_HEX_WALL_MAX_HP);
    const rng = () => {
      const v = (i++ % 100) * 0.001;
      return Math.min(0.999, Math.max(0.001, v));
    };
    expect(() => advanceNightlyDefenseRound(daily, hexMap, rng)).not.toThrow();
  });
});
