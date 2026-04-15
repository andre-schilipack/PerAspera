import { describe, expect, it } from 'vitest';

import {
  createEmptyDailyDefense,
  createInitialWallState,
} from '../domain/factories/createDefenseSeed.ts';
import { buildNightlyDefenseAdvanceCommit } from './nightlyDefenseAdvance.ts';

describe('buildNightlyDefenseAdvanceCommit', () => {
  it('does not advance combat when daily phase is not fighting', () => {
    const dailyDefense = createEmptyDailyDefense({ date: '2026-04-08' });
    const wall = createInitialWallState();
    const commit = buildNightlyDefenseAdvanceCommit(
      {
        dailyDefense,
        wall,
        nextCombatLogEntryId: 12,
        civilianPopulation: 500,
        hexMap: null,
      },
      () => 0.5,
      1_700_000_000_000,
    );
    expect(commit.nextCombatLogEntryId).toBe(12);
    expect(commit.defenderHpSync).toBeUndefined();
    expect(commit.victoryRewards).toBeUndefined();
    expect(commit.breachRaid).toBeUndefined();
    expect(commit.dailyDefense.phase).toBe('idle');
    expect(commit.wall).toEqual(wall);
  });
});
