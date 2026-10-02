import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from './simulate.ts';

describe('immobile and vital units', () => {
  it('does not move an immobile unit', () => {
    const res = simulateBattle({
      battleId: 'immobile-1',
      maxTicks: 12,
      randomSource: () => 0.99,
      retreatChance: 0,
      units: [
        {
          unitId: 'tower',
          teamId: 'A',
          role: 'ranged',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 50,
          maxMana: 0,
          speed: 5,
          immobile: true,
          skillIds: [],
        },
        {
          unitId: 'foe',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,4',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 80,
          maxMana: 0,
          speed: 1,
        },
      ],
    });

    expect(
      res.canonicalEvents.some(
        (e) => e.type === 'unit_moved' && e.unitId === 'tower',
      ),
    ).toBe(false);
  });

  it('ends the battle when a vital anchor dies', () => {
    const res = simulateBattle({
      battleId: 'vital-1',
      maxTicks: 30,
      randomSource: () => 0.99,
      retreatChance: 0,
      permadeathChance: 0,
      units: [
        {
          unitId: 'hall',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 1,
          hp: 1,
          maxMana: 0,
          speed: 0.1,
          immobile: true,
          vital: true,
          skillIds: [],
        },
        {
          unitId: 'ally',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,1',
          attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 1 },
          maxHp: 500,
          maxMana: 0,
          speed: 1,
          skillIds: [],
        },
        {
          unitId: 'foe',
          teamId: 'B',
          role: 'frontline',
          tileId: '1,0',
          attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 8 },
          maxHp: 80,
          maxMana: 0,
          speed: 8,
          skillIds: [],
        },
      ],
    });

    expect(res.finalState.winningTeamId).toBe('B');
    expect(res.canonicalEvents.some((e) => e.type === 'unit_died' && e.unitId === 'hall')).toBe(
      true,
    );
  });
});
