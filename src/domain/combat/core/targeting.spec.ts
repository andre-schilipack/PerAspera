import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import type { MoveTemplate } from '../../types/combat.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 4 targeting + obstacles', () => {
  it('does not move into blocked tiles', () => {
    const res = simulateBattle({
      battleId: 'ob-1',
      maxTicks: 5,
      randomSource: () => 0.9,
      obstacles: new Set(['0,1']),
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          maxMana: 0,
          speed: 10, // act every tick
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,2',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          maxMana: 0,
          speed: 1,
        },
      ],
    });

    const movedIntoBlocked = res.canonicalEvents.some(
      (e) => e.type === 'unit_moved' && e.toTileId === '0,1',
    );
    expect(movedIntoBlocked).toBe(false);
  });

  it('ranged skill does not cast outside its range', () => {
    const ranged: MoveTemplate = {
      id: 'test_ranged',
      name: 'Test Ranged',
      description: 'Test',
      effect: { kind: 'damage' },
      damageKind: 'fire',
      targets: 'single',
      cost: 0,
      power: { mode: 'flat', basePower: 5 },
      tags: ['ranged', 'single'],
      cooldownTurns: 1,
    };

    const res = simulateBattle({
      battleId: 'rng-1',
      maxTicks: 3,
      randomSource: () => 0.9,
      // Lock the unit in place so it can't step into range.
      obstacles: new Set(['0,1', '1,0', '1,-1', '0,-1', '-1,0', '-1,1']),
      getSkillTemplate: (id) =>
        id === ranged.id ? ({ ...ranged, range: 1 } as any) : undefined,
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'ranged',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          maxMana: 0,
          mana: 0,
          skillIds: [ranged.id],
          speed: 10,
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,3',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          maxMana: 0,
          speed: 1,
        },
      ],
    });

    const cast = res.canonicalEvents.find(
      (e) => e.type === 'unit_acted' && e.unitId === 'A1' && e.action === 'cast',
    );
    expect(cast).toBeUndefined();
  });
});

