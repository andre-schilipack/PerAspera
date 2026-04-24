import { describe, expect, it } from 'vitest';

import { createEmptyDailyDefense, createInitialWallState } from './factories/createDefenseSeed.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import {
  createWallBreachHandoffSnapshot,
  openPrefeituraPhaseAfterWallBreach,
} from './defenseEncounterOrchestration.ts';

describe('defenseEncounterOrchestration', () => {
  it('openPrefeituraPhaseAfterWallBreach skips raid when hexMap is null', () => {
    const base = createEmptyDailyDefense({ date: '2026-01-01' });
    const wall = createInitialWallState();
    const daily = {
      ...base,
      phase: 'ended' as const,
      outcome: 'breach' as const,
      isCompleted: true,
      currentTurn: 2,
      enemies: [
        {
          enemyId: 'x',
          currentHealth: 5,
          maxHealth: 10,
          tacticalBucket: 'front' as const,
          buffs: {},
        },
      ],
      totalEnemyPoints: 5,
      defenderLine: [],
      targetHexId: '1,0',
    };

    const snap = createWallBreachHandoffSnapshot(daily, wall, 10);
    const r = openPrefeituraPhaseAfterWallBreach({
      snapshot: snap,
      hexMap: null,
      civilianPopulation: 1000,
      targetHexId: '1,0',
      rng: () => 0.5,
      now: 1_800_000_000_000,
    });

    expect(r.breachRaid).toBe('skipped');
    expect(r.dailyDefense.victoryLootPool).toEqual([]);
  });

  it('openPrefeituraPhaseAfterWallBreach opens siege when threat remains after raid', () => {
    const base = createEmptyDailyDefense({ date: '2026-01-02' });
    const wall = createInitialWallState();
    const enemies = [
      {
        enemyId: 'g',
        currentHealth: 30,
        maxHealth: 30,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const daily = {
      ...base,
      phase: 'ended' as const,
      outcome: 'breach' as const,
      isCompleted: true,
      currentTurn: 1,
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [
        {
          characterId: 'c1',
          name: 'Hero',
          currentHp: 20,
          maxHp: 20,
          retreated: true,
          tacticalBucket: 'front' as const,
        },
      ],
      targetHexId: '2,0',
    };

    const snap = createWallBreachHandoffSnapshot(daily, wall, 5);
    const r = openPrefeituraPhaseAfterWallBreach({
      snapshot: snap,
      hexMap: { hexes: {} },
      civilianPopulation: 100,
      targetHexId: '2,0',
      rng: () => 0.2,
      now: 1_800_000_000_000,
    });

    expect(r.breachRaid).not.toBe('skipped');
    if (r.breachRaid === 'skipped') return;
    expect(r.dailyDefense.outcome).toBe('prefeitura_siege');
    expect(r.dailyDefense.phase).toBe('fighting');
    expect(r.dailyDefense.isCompleted).toBe(false);
    const living = r.dailyDefense.defenderLine.filter((d) => d.currentHp > 0);
    for (const d of living) {
      expect(d.retreated).toBe(false);
    }
  });
});
