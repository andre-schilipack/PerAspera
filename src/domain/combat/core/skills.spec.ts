import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import type { MoveTemplate } from '../../types/combat.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 3 skills', () => {
  it('does not cast when mana is insufficient', () => {
    const expensive: MoveTemplate = {
      id: 'expensive_spell',
      name: 'Expensive Spell',
      description: 'Test',
      effect: { kind: 'damage' },
      damageKind: 'fire',
      targets: 'single',
      cost: 5,
      power: { mode: 'flat', basePower: 50 },
      tags: ['ranged', 'single'],
      cooldownSeconds: 1,
    };

    const res = simulateBattle({
      battleId: 'mana-1',
      maxTicks: 5,
      randomSource: () => 0.9,
      getSkillTemplate: (id) => (id === expensive.id ? expensive : undefined),
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          maxMana: 0,
          mana: 0,
          skillIds: [expensive.id],
          speed: 1,
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,1',
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

  it('respects cooldown measured in fight seconds', () => {
    const cdSkill: MoveTemplate = {
      id: 'cd_skill',
      name: 'CD Skill',
      description: 'Test',
      effect: { kind: 'damage' },
      damageKind: 'physical',
      targets: 'single',
      cost: 0,
      power: { mode: 'flat', basePower: 1 },
      tags: ['single', 'ranged'],
      cooldownSeconds: 3,
    };

    const res = simulateBattle({
      battleId: 'cd-1',
      maxTicks: 40,
      randomSource: () => 0.9,
      getSkillTemplate: (id) => (id === cdSkill.id ? cdSkill : undefined),
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 10 },
          maxHp: 500,
          maxMana: 0,
          mana: 0,
          skillIds: [cdSkill.id],
          speed: 10, // act every tick (baseDelay=1)
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,1',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 500,
          maxMana: 0,
          speed: 0.1,
        },
      ],
    });

    const castTicks = res.canonicalEvents
      .filter((e) => e.type === 'unit_acted' && e.unitId === 'A1' && e.action === 'cast')
      .map((e) => e.t);

    // 3s cooldown = 30 ticks (1 tick = 0.1s). First cast at t0.
    expect(castTicks[0]).toBe(0);
    expect(castTicks.length).toBeGreaterThan(1);
    for (let i = 1; i < castTicks.length; i++) {
      expect(castTicks[i]! - castTicks[i - 1]!).toBeGreaterThanOrEqual(30);
    }
  });
});

