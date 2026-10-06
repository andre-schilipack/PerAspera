import { describe, expect, it } from 'vitest';

import { getMoveTemplate } from '../../../content/catalogs/moves.ts';
import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import type { MoveTemplate } from '../../types/combat.ts';
import { simulateBattle } from '../core/simulate.ts';
import type { BattleState, UnitState } from '../core/types.ts';

import { decideAlgo } from './algoPolicy.ts';
import type { AlgoProgram } from './policy.ts';

function unit(over: Partial<UnitState> & Pick<UnitState, 'unitId' | 'teamId'>): UnitState {
  return {
    role: 'frontline',
    tileId: '0,0',
    attributes: DEFAULT_CORE_ATTRIBUTES,
    hp: 20,
    maxHp: 20,
    mana: 0,
    maxMana: 0,
    skillIds: ['basic_attack'],
    cooldowns: {},
    statuses: {},
    speed: 1,
    alive: true,
    retreated: false,
    nextActAt: 0,
    immobile: false,
    vital: false,
    ...over,
  };
}

function stateOf(units: UnitState[]): BattleState {
  const unitsById: Record<string, UnitState> = {};
  for (const u of units) unitsById[u.unitId] = u;
  return { tick: 0, unitsById };
}

describe('decideAlgo', () => {
  it('fires the first matching rule and skips a disabled one', () => {
    const actor = unit({ unitId: 'A', teamId: 'players', tileId: '0,0' });
    const foe = unit({ unitId: 'B', teamId: 'hostiles', tileId: '0,1', hp: 4, maxHp: 20 });
    const program: AlgoProgram = {
      rules: [
        {
          enabled: false,
          when: { kind: 'foe_nearest' },
          do: { kind: 'skill', skillId: 'cure' },
        },
        {
          enabled: true,
          when: { kind: 'foe_hp_at_most', percent: 50 },
          do: { kind: 'skill', skillId: 'basic_attack' },
        },
      ],
    };
    const decision = decideAlgo({
      actor,
      program,
      state: stateOf([actor, foe]),
      livingByTeam: { players: new Set(['A']), hostiles: new Set(['B']) },
      getSkillTemplate: getMoveTemplate,
    });
    expect(decision).toEqual({ kind: 'use', skillId: 'basic_attack', targetId: 'B' });
  });

  it('skips a skill that is not ready and falls through', () => {
    const expensive: MoveTemplate = {
      id: 'expensive_spell',
      name: 'Expensive',
      description: 'Test',
      effect: { kind: 'damage' },
      damageKind: 'fire',
      targets: 'single',
      cost: 5,
      power: { mode: 'flat', basePower: 10 },
      tags: ['single'],
    };
    const actor = unit({
      unitId: 'A',
      teamId: 'players',
      mana: 0,
      maxMana: 0,
      skillIds: ['expensive_spell', 'basic_attack'],
    });
    const foe = unit({ unitId: 'B', teamId: 'hostiles', tileId: '0,1' });
    const decision = decideAlgo({
      actor,
      program: {
        rules: [
          { enabled: true, when: { kind: 'foe_nearest' }, do: { kind: 'skill', skillId: 'expensive_spell' } },
          { enabled: true, when: { kind: 'foe_nearest' }, do: { kind: 'skill', skillId: 'basic_attack' } },
        ],
      },
      state: stateOf([actor, foe]),
      livingByTeam: { players: new Set(['A']), hostiles: new Set(['B']) },
      getSkillTemplate: (id) => (id === expensive.id ? expensive : getMoveTemplate(id)),
    });
    expect(decision).toEqual({ kind: 'use', skillId: 'basic_attack', targetId: 'B' });
  });

  it('waits when nothing matches', () => {
    const actor = unit({ unitId: 'A', teamId: 'players', hp: 20, maxHp: 20 });
    const foe = unit({ unitId: 'B', teamId: 'hostiles', tileId: '0,1' });
    const decision = decideAlgo({
      actor,
      program: {
        rules: [
          {
            enabled: true,
            when: { kind: 'self_hp_at_most', percent: 10 },
            do: { kind: 'retreat' },
          },
        ],
      },
      state: stateOf([actor, foe]),
      livingByTeam: { players: new Set(['A']), hostiles: new Set(['B']) },
      getSkillTemplate: getMoveTemplate,
    });
    expect(decision).toEqual({ kind: 'wait' });
  });
});

describe('simulateBattle AlgoCombat', () => {
  it('retreats from a program even when the autoplay retreat roll is off', () => {
    const res = simulateBattle({
      battleId: 'algo-retreat',
      maxTicks: 5,
      randomSource: () => 0.99,
      retreatChance: 0,
      units: [
        {
          unitId: 'Z1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          hp: 20,
          maxMana: 0,
          speed: 1,
          algoProgram: {
            rules: [
              {
                enabled: true,
                when: { kind: 'self_hp_at_most', percent: 100 },
                do: { kind: 'retreat' },
              },
            ],
          },
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

    expect(
      res.canonicalEvents.some((e) => e.type === 'unit_retreated' && e.unitId === 'Z1'),
    ).toBe(true);
    expect(
      res.canonicalEvents.some(
        (e) => e.type === 'unit_acted' && e.unitId === 'B1' && e.action === 'attack',
      ),
    ).toBe(true);
  });

  it('heals the wounded ally named by the rule', () => {
    const res = simulateBattle({
      battleId: 'algo-heal',
      maxTicks: 3,
      randomSource: () => 0.5,
      retreatChance: 0,
      units: [
        {
          unitId: 'medic',
          teamId: 'A',
          role: 'support',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          hp: 20,
          maxMana: 0,
          speed: 10,
          skillIds: ['cure'],
          algoProgram: {
            rules: [
              {
                enabled: true,
                when: { kind: 'ally_hp_at_most', percent: 50 },
                do: { kind: 'skill', skillId: 'cure' },
              },
            ],
          },
        },
        {
          unitId: 'hurt',
          teamId: 'A',
          role: 'frontline',
          tileId: '1,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 20,
          hp: 4,
          maxMana: 0,
          speed: 1,
          skillIds: [],
        },
        {
          unitId: 'foe',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,2',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 40,
          maxMana: 0,
          speed: 1,
          skillIds: [],
        },
      ],
    });

    const healed = res.canonicalEvents.find((e) => e.type === 'healed');
    expect(healed && healed.type === 'healed' ? healed.targetId : null).toBe('hurt');
    expect(healed && healed.type === 'healed' ? healed.sourceId : null).toBe('medic');
  });

  it('does not recast a self-buff while it is up or on cooldown', () => {
    const res = simulateBattle({
      battleId: 'algo-buff-cd',
      maxTicks: 80,
      randomSource: () => 0.99,
      retreatChance: 0,
      units: [
        {
          unitId: 'A1',
          teamId: 'A',
          role: 'frontline',
          tileId: '0,0',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 80,
          hp: 80,
          maxMana: 0,
          speed: 1,
          skillIds: ['be_like_water', 'basic_attack'],
          algoProgram: {
            rules: [
              {
                enabled: true,
                when: { kind: 'self' },
                do: { kind: 'skill', skillId: 'be_like_water' },
              },
              {
                enabled: true,
                when: { kind: 'foe_nearest' },
                do: { kind: 'skill', skillId: 'basic_attack' },
              },
            ],
          },
        },
        {
          unitId: 'B1',
          teamId: 'B',
          role: 'frontline',
          tileId: '0,1',
          attributes: DEFAULT_CORE_ATTRIBUTES,
          maxHp: 500,
          hp: 500,
          maxMana: 0,
          speed: 0.1,
          skillIds: [],
        },
      ],
    });

    const buffTicks = res.canonicalEvents
      .filter(
        (e) =>
          e.type === 'unit_acted' &&
          e.unitId === 'A1' &&
          e.action === 'cast' &&
          e.skillId === 'be_like_water',
      )
      .map((e) => e.t);

    expect(buffTicks[0]).toBe(0);
    expect(buffTicks.length).toBeGreaterThan(1);
    for (let i = 1; i < buffTicks.length; i++) {
      expect(buffTicks[i]! - buffTicks[i - 1]!).toBeGreaterThanOrEqual(70);
    }
    const attacksBetween = res.canonicalEvents.filter(
      (e) =>
        e.type === 'unit_acted' &&
        e.unitId === 'A1' &&
        e.action === 'cast' &&
        e.skillId === 'basic_attack' &&
        e.t > buffTicks[0]! &&
        e.t < buffTicks[1]!,
    );
    expect(attacksBetween.length).toBeGreaterThan(0);
  });
});
