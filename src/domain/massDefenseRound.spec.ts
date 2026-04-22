import { describe, expect, it } from 'vitest';

import { createEmptyDailyDefense, createInitialWallState } from './factories/createDefenseSeed.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import {
  defenderLineForPrefeituraSiege,
  normalizeMassDefenseDefenderLine,
  runMassDefenseCombatRound,
} from './massDefenseRound.ts';

describe('massDefenseRound', () => {
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

  it('runMassDefenseCombatRound nightly_wall increments turn and appends lines', () => {
    const wall = createInitialWallState();
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

    const r = runMassDefenseCombatRound({
      structureMode: 'nightly_wall',
      daily,
      wall,
      rng: () => 0.55,
      defenderLine: [],
    });

    expect(r.nextDaily.currentTurn).toBe(1);
    expect(r.newLogLines.some((l) => l.text.includes('Nightly defense'))).toBe(
      true,
    );
    expect(r.hexMap).toBeUndefined();
  });
});
