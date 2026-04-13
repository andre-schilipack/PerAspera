import { describe, expect, it } from 'vitest';

import {
  composeWaveFromBudget,
  pickRandomWallCardinal,
  sumLivingThreatPoints,
  targetThreatBudget,
  threatPointsForEnemyId,
} from './enemyThreat.ts';

describe('enemyThreat', () => {
  it('threatPointsForEnemyId defaults unknown to 1', () => {
    expect(threatPointsForEnemyId('drone_scout')).toBe(1);
    expect(threatPointsForEnemyId('unknown_x')).toBe(1);
  });

  it('sumLivingThreatPoints sums only living', () => {
    expect(
      sumLivingThreatPoints([
        { enemyId: 'drone_scout', currentHealth: 5, buffs: {} },
        { enemyId: 'drone_scout', currentHealth: 0, buffs: {} },
      ]),
    ).toBe(1);
  });

  it('targetThreatBudget scales with day', () => {
    expect(targetThreatBudget(0)).toBe(2);
    expect(targetThreatBudget(1)).toBe(2);
    expect(targetThreatBudget(2)).toBe(3);
  });

  it('composeWaveFromBudget respects budget', () => {
    const rng = () => 0.5;
    const wave = composeWaveFromBudget(5, rng);
    expect(wave.length).toBe(5);
    expect(sumLivingThreatPoints(wave)).toBe(5);
  });

  it('pickRandomWallCardinal is stable with fixed rng', () => {
    const rng = () => 0;
    expect(pickRandomWallCardinal(rng)).toBe('north');
  });
});
