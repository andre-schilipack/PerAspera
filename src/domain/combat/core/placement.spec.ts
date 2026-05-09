import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 7 auto placement', () => {
  it('auto-places units when tileId is empty, respecting obstacles', () => {
    const obstacles = new Set(['0,1', '0,2', '0,3', '0,4']);
    const res = simulateBattle({
      battleId: 'place-1',
      maxTicks: 1,
      randomSource: () => 0.9,
      obstacles,
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 10,
          maxMana: 0,
          skillIds: [],
          speed: 1,
        },
        {
          unitId: 'A2',
          teamId: 'A',
          role: 'ranged',
          tileId: '',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 10,
          maxMana: 0,
          skillIds: [],
          speed: 1,
        },
      ],
    });

    const spawns = res.canonicalEvents.filter((e) => e.type === 'unit_spawned');
    expect(spawns.length).toBe(2);
    for (const s of spawns) {
      expect(s.tileId).not.toBe('');
      expect(obstacles.has(s.tileId)).toBe(false);
    }
    expect(spawns[0]!.tileId).not.toBe(spawns[1]!.tileId);
  });
});

