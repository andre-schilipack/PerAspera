import { describe, expect, it } from 'vitest';

import { createEmptyDailyDefense, createInitialWallState } from './factories/createDefenseSeed.ts';
import { advanceEncounterCombatRound } from './encounterCombat.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import { runMassDefenseCombatRound } from './massDefenseRound.ts';

describe('encounterCombat API', () => {
  it('advanceEncounterCombatRound matches runMassDefenseCombatRound for nightly_wall', () => {
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

    const rng = () => 0.55;

    const legacy = runMassDefenseCombatRound({
      structureMode: 'nightly_wall',
      daily,
      wall,
      rng,
      defenderLine: [],
    });

    const unified = advanceEncounterCombatRound({
      theater: 'nightly_wall',
      rng,
      allies: [],
      enemies,
      structures: { wall },
      session: { daily },
    });

    expect(unified.nextDaily.currentTurn).toBe(legacy.nextDaily.currentTurn);
    expect(unified.fightEnded).toBe(legacy.fightEnded);
    expect(unified.newLogLines.length).toBe(legacy.newLogLines.length);
    expect(unified.wallResult.breached).toBe(legacy.wallResult.breached);
  });
});
