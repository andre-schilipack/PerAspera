import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 1', () => {
  it('favored team wins most of the time (statistical)', () => {
    const N = 200;
    let winsA = 0;
    let winsB = 0;

    for (let i = 0; i < N; i++) {
      const result = simulateBattle({
        battleId: `t-${String(i)}`,
        maxTicks: 500,
        units: [
          // Team A: beefier and stronger.
          {
            unitId: 'A1',
            teamId: 'A',
            role: 'frontline',
            tileId: '0,0',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 4, vitality: 3 },
            maxHp: 60,
            maxMana: 0,
            speed: 1,
          },
          {
            unitId: 'A2',
            teamId: 'A',
            role: 'frontline',
            tileId: '0,1',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 4, vitality: 3 },
            maxHp: 60,
            maxMana: 0,
            speed: 1,
          },
          // Team B: weaker.
          {
            unitId: 'B1',
            teamId: 'B',
            role: 'frontline',
            tileId: '1,0',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 1, vitality: 1 },
            maxHp: 35,
            maxMana: 0,
            speed: 1,
          },
          {
            unitId: 'B2',
            teamId: 'B',
            role: 'frontline',
            tileId: '1,1',
            attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 1, vitality: 1 },
            maxHp: 35,
            maxMana: 0,
            speed: 1,
          },
        ],
      });

      if (result.finalState.winningTeamId === 'A') winsA++;
      if (result.finalState.winningTeamId === 'B') winsB++;
    }

    // Favored team should win overwhelmingly.
    expect(winsA).toBeGreaterThanOrEqual(160);
    // In this specific setup Team B may never win; that's acceptable.
    expect(winsA + winsB).toBe(N);
  });
});

