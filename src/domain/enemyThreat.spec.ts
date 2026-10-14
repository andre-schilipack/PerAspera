import { describe, expect, it } from 'vitest';

import {
  composeWaveFromBudget,
  pickRandomWallCardinal,
  reduceCityThreatFromNestDamage,
  sumLivingThreatPoints,
  targetThreatBudget,
  threatPointsForEnemyId,
  waveBudgetFromCityThreat,
} from './enemyThreat.ts';

describe('enemyThreat', () => {
  it('threatPointsForEnemyId defaults unknown to 1', () => {
    expect(threatPointsForEnemyId('drone_scout')).toBe(1);
    expect(threatPointsForEnemyId('unknown_x')).toBe(1);
  });

  it('sumLivingThreatPoints sums only living', () => {
    expect(
      sumLivingThreatPoints([
        { enemyId: 'drone_scout', currentHealth: 5, maxHealth: 5, buffs: {} },
        { enemyId: 'drone_scout', currentHealth: 0, maxHealth: 5, buffs: {} },
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

  it('waveBudgetFromCityThreat floors campaign threat', () => {
    expect(waveBudgetFromCityThreat(2.9)).toBe(2);
    expect(waveBudgetFromCityThreat(0.4)).toBe(0);
  });

  it('reduceCityThreatFromNestDamage scales with nest HP lost', () => {
    const half = reduceCityThreatFromNestDamage({
      cityThreatLevel: 4,
      nestHpLost: 100,
      nestMaxHp: 200,
      fullNestThreatReduction: 4,
    });
    expect(half.threatReduced).toBeCloseTo(2);
    expect(half.nextThreat).toBeCloseTo(2);

    const full = reduceCityThreatFromNestDamage({
      cityThreatLevel: 4,
      nestHpLost: 200,
      nestMaxHp: 200,
      fullNestThreatReduction: 4,
    });
    expect(full.threatReduced).toBeCloseTo(4);
    expect(full.nextThreat).toBe(0);
  });
});
