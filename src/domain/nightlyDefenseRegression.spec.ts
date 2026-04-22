import { describe, expect, it } from 'vitest';

import {
  createEmptyDailyDefense,
  createInitialWallState,
} from './factories/createDefenseSeed.ts';
import { advanceNightlyDefenseRound } from './nightlyDefenseCombat.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import type {
  DailyDefenseState,
  WallCardinal,
  WallState,
} from './types/defense.ts';

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

/** Wall section almost broken — wall-only strike cycle breaches in one hostile hit (high rolls). */
function fragileWall(section: WallCardinal, hp: number): WallState {
  const base = createInitialWallState();
  const sec = base.sections[section];
  return {
    ...base,
    sections: {
      ...base.sections,
      [section]: {
        ...sec,
        current: hp,
        max: sec.max,
        breached: false,
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
    const wall = createInitialWallState();
    const r = advanceNightlyDefenseRound(daily, wall, () => 0.5);
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
    const r = advanceNightlyDefenseRound(daily, createInitialWallState(), () => 0.999);
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
      attackedSection: 'north',
    });
    const wall = fragileWall('north', 4);
    const r = advanceNightlyDefenseRound(daily, wall, () => 0.95);
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
    const rng = () => {
      const v = (i++ % 100) * 0.001;
      return Math.min(0.999, Math.max(0.001, v));
    };
    expect(() =>
      advanceNightlyDefenseRound(daily, createInitialWallState(), rng),
    ).not.toThrow();
  });
});
