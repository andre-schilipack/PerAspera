import { describe, expect, it } from 'vitest';

import { getMoveTemplate } from '../../../content/catalogs/moves.ts';
import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 8 AoE targeting', () => {
  it('multi-target skill hits primary cluster (hex neighbors)', () => {
    const res = simulateBattle({
      battleId: 'aoe-multi',
      maxTicks: 30,
      randomSource: () => 0.99,
      getSkillTemplate: (id) => getMoveTemplate(id),
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'ranged',
          tileId: '0,0',
          attributes: { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 12 },
          maxHp: 100,
          maxMana: 100,
          mana: 100,
          skillIds: ['fireball'],
          speed: 10,
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,2',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 80,
          maxMana: 0,
          speed: 1,
        },
        {
          unitId: 'B2',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,1',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 80,
          maxMana: 0,
          speed: 1,
        },
      ],
    });

    const castIdx = res.canonicalEvents.findIndex(
      (e) => e.type === 'unit_acted' && e.action === 'cast' && e.skillId === 'fireball',
    );
    expect(castIdx).toBeGreaterThanOrEqual(0);
    const castTick = res.canonicalEvents[castIdx]!.t;
    const fireHitsSameTick = res.canonicalEvents.filter(
      (e) =>
        e.type === 'damage_dealt' &&
        e.t === castTick &&
        e.sourceId === 'A1' &&
        e.damageKind === 'fire',
    );
    expect(fireHitsSameTick.length).toBe(2);
    const hitIds = new Set(fireHitsSameTick.map((e) => e.targetId));
    expect(hitIds.has('B1')).toBe(true);
    expect(hitIds.has('B2')).toBe(true);
  });

  it('all-target skill strikes every hostile in skill range', () => {
    const res = simulateBattle({
      battleId: 'aoe-all',
      maxTicks: 30,
      randomSource: () => 0.99,
      getSkillTemplate: (id) => getMoveTemplate(id),
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'ranged',
          tileId: '0,0',
          attributes: { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 10 },
          maxHp: 100,
          maxMana: 100,
          mana: 100,
          skillIds: ['arc_burst'],
          speed: 10,
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,3',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 40,
          maxMana: 0,
          speed: 1,
        },
        {
          unitId: 'B2',
          teamId: 'B',
          role: 'frontline',
          tileId: '-2,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 40,
          maxMana: 0,
          speed: 1,
        },
      ],
    });

    const castIdx = res.canonicalEvents.findIndex(
      (e) => e.type === 'unit_acted' && e.action === 'cast' && e.skillId === 'arc_burst',
    );
    expect(castIdx).toBeGreaterThanOrEqual(0);
    const castTick = res.canonicalEvents[castIdx]!.t;
    const electricHits = res.canonicalEvents.filter(
      (e) =>
        e.type === 'damage_dealt' &&
        e.t === castTick &&
        e.sourceId === 'A1' &&
        e.damageKind === 'electric',
    );
    expect(electricHits.length).toBe(2);
  });
});
