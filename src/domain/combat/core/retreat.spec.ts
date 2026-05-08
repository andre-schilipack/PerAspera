import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 6 retreat + permadeath', () => {
  it('a retreated unit stops acting and stops being targeted', () => {
    const res = simulateBattle({
      battleId: 'ret-1',
      maxTicks: 30,
      randomSource: () => 0, // always retreat + always permadeath when used
      retreatHpFraction: 1, // always in retreat zone
      retreatChance: 1,
      permadeathChance: 0,
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          maxMana: 0,
          speed: 10,
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,1',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          maxMana: 0,
          speed: 10,
        },
      ],
    });

    const ret = res.canonicalEvents.find(
      (e) => e.type === 'unit_retreated' && e.unitId === 'A1',
    );
    expect(ret).toBeTruthy();

    const retIndex = res.canonicalEvents.findIndex(
      (e) => e.type === 'unit_retreated' && e.unitId === 'A1',
    );
    const after = res.canonicalEvents.slice(Math.max(0, retIndex + 1));

    // No more actions by A1 after retreat.
    expect(
      after.some((e) => e.type === 'unit_acted' && e.unitId === 'A1'),
    ).toBe(false);

    // No more attacks/casts targeting A1 after retreat.
    expect(
      after.some(
        (e) =>
          e.type === 'unit_acted' &&
          (e.action === 'attack' || e.action === 'cast') &&
          e.targetId === 'A1',
      ),
    ).toBe(false);
  });

  it('permadeath is recorded on unit_died event (not computed by playback)', () => {
    const res = simulateBattle({
      battleId: 'pd-1',
      maxTicks: 50,
      randomSource: () => 0.9,
      retreatHpFraction: 0, // disable retreat
      retreatChance: 0,
      permadeathChance: 1, // always permadeath on death
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 10 },
          maxHp: 200,
          maxMana: 0,
          speed: 10,
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,1',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 10,
          maxMana: 0,
          speed: 1,
        },
      ],
    });

    const died = res.canonicalEvents.find(
      (e) => e.type === 'unit_died' && e.unitId === 'B1',
    );
    expect(died && died.permadeath).toBe(true);
  });
});

