import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from '../core/simulate.ts';
import { playback } from './playback.ts';
import { validateEventRefs } from './eventSchema.ts';

describe('combat engine slice 2 playback', () => {
  it('playback finalState matches simulate finalState (N=100)', () => {
    const N = 100;
    for (let i = 0; i < N; i++) {
      const res = simulateBattle({
        battleId: `pb-${String(i)}`,
        maxTicks: 500,
        units: [
          {
            unitId: 'A1',
            teamId: 'A',
            role: 'frontline',
            tileId: '0,0',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 3, vitality: 2 },
            maxHp: 45,
            maxMana: 0,
            speed: 1,
          },
          {
            unitId: 'A2',
            teamId: 'A',
            role: 'frontline',
            tileId: '0,1',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 3, vitality: 2 },
            maxHp: 45,
            maxMana: 0,
            speed: 1,
          },
          {
            unitId: 'B1',
            teamId: 'B',
            role: 'frontline',
            tileId: '1,0',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 2, vitality: 1 },
            maxHp: 40,
            maxMana: 0,
            speed: 1,
          },
          {
            unitId: 'B2',
            teamId: 'B',
            role: 'frontline',
            tileId: '1,1',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 2, vitality: 1 },
            maxHp: 40,
            maxMana: 0,
            speed: 1,
          },
        ],
      });

      const pb = playback(res.canonicalEvents);
      expect(pb.finalState).toEqual(res.finalState);
    }
  });

  it('canonicalEvents do not reference unknown unitIds', () => {
    const res = simulateBattle({
      battleId: 'refs-1',
      maxTicks: 50,
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 10,
          maxMana: 0,
          speed: 1,
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '1,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 10,
          maxMana: 0,
          speed: 1,
        },
      ],
    });
    expect(() => validateEventRefs(res.canonicalEvents)).not.toThrow();
  });
});

