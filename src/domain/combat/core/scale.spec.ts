import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 9 scale', () => {
  it('completes a dense many-vs-many battle within a reasonable time budget', () => {
    const units: Parameters<typeof simulateBattle>[0]['units'] = [];
    for (let i = 0; i < 100; i++) {
      units.push({
        unitId: `A${String(i).padStart(3, '0')}`,
        teamId: 'A',
        role: 'frontline',
        tileId: '',
        attributes: DEFAULT_CORE_ATTRIBUTES,
        maxHp: 8,
        maxMana: 0,
        skillIds: [],
        speed: 1,
      });
    }
    for (let i = 0; i < 100; i++) {
      units.push({
        unitId: `B${String(i).padStart(3, '0')}`,
        teamId: 'B',
        role: 'frontline',
        tileId: '',
        attributes: DEFAULT_CORE_ATTRIBUTES,
        maxHp: 8,
        maxMana: 0,
        skillIds: [],
        speed: 1,
      });
    }

    const t0 = performance.now();
    const res = simulateBattle({
      battleId: 'scale-200',
      maxTicks: 60,
      randomSource: () => 0.42,
      units,
    });
    const elapsedMs = performance.now() - t0;

    expect(res.finalState.ticksElapsed).toBeGreaterThan(0);
    expect(res.canonicalEvents.some((e) => e.type === 'damage_dealt')).toBe(true);
    expect(elapsedMs).toBeLessThan(1500);
  });
});
