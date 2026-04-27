import { describe, expect, it } from 'vitest';

import { MOVE_CATALOG } from '../../content/catalogs/moves.ts';
import { DEFAULT_CORE_ATTRIBUTES, type CoreAttributes } from '../types/attributes.ts';
import { combatBeatPhaseFromTurns } from './combatBeatPhase.ts';
import { computeRawPower } from './movePower.ts';
import { pickAutoplaySkill, scoreSkillTemplate } from './skillPick.ts';

const zeroRng = () => 0;

describe('combatBeatPhaseFromTurns', () => {
  it('uses approach for the first turns when HP is safe', () => {
    expect(
      combatBeatPhaseFromTurns({
        turn: 1,
        attackerHpFraction: 0.9,
        defenderHpFraction: 0.9,
      }),
    ).toBe('approach');
    expect(
      combatBeatPhaseFromTurns({
        turn: 2,
        attackerHpFraction: 0.9,
        defenderHpFraction: 0.9,
      }),
    ).toBe('approach');
  });

  it('moves to contact after early turns with safe HP', () => {
    expect(
      combatBeatPhaseFromTurns({
        turn: 3,
        attackerHpFraction: 0.8,
        defenderHpFraction: 0.8,
      }),
    ).toBe('contact');
  });

  it('forces endgame when either side is low on HP', () => {
    expect(
      combatBeatPhaseFromTurns({
        turn: 1,
        attackerHpFraction: 0.2,
        defenderHpFraction: 0.9,
      }),
    ).toBe('endgame');
  });
});

describe('computeRawPower', () => {
  it('applies flat and attribute modes', () => {
    const t1 = MOVE_CATALOG.basic_attack;
    expect(computeRawPower(t1, DEFAULT_CORE_ATTRIBUTES)).toBe(10);
    const t2 = MOVE_CATALOG.int_spike;
    const highInt: CoreAttributes = {
      ...DEFAULT_CORE_ATTRIBUTES,
      intelligence: 3,
    };
    expect(computeRawPower(t2, highInt)).toBe(4 + 5 * 3);
  });

  it('sums multiple attribute terms for scaleSum', () => {
    const cure = MOVE_CATALOG.cure;
    expect(cure.power.mode).toBe('scaleSum');
    expect(computeRawPower(cure, DEFAULT_CORE_ATTRIBUTES)).toBe(
      2 + 2 * 1 + 2 * 1,
    );
  });
});

describe('pickAutoplaySkill', () => {
  it('favors int_spike at high INT (with fixed rng edge)', () => {
    const high: CoreAttributes = {
      ...DEFAULT_CORE_ATTRIBUTES,
      intelligence: 8,
    };
    const pick = pickAutoplaySkill(
      ['basic_attack', 'int_spike'],
      (id) => MOVE_CATALOG[id],
      high,
      {
        combatBeatPhase: 'contact',
        defenderHpFraction: 0.5,
        rng: zeroRng,
      },
    );
    expect(pick?.id).toBe('int_spike');
  });

  it('can ignore unavailable moves when picking autoplay skills', () => {
    const pick = pickAutoplaySkill(
      ['fireball', 'basic_attack'],
      (id) => MOVE_CATALOG[id],
      { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 8 },
      {
        combatBeatPhase: 'contact',
        defenderHpFraction: 0.5,
        rng: zeroRng,
        isMoveAvailable: (template) => template.id !== 'fireball',
      },
    );
    expect(pick?.id).toBe('basic_attack');
  });
});

describe('scoreSkillTemplate', () => {
  it('adds tactical weight so hack moves can outrank slightly weaker raw power', () => {
    const sBasic = scoreSkillTemplate(
      MOVE_CATALOG.basic_attack,
      DEFAULT_CORE_ATTRIBUTES,
      {
        combatBeatPhase: 'approach',
        defenderHpFraction: 0.5,
        rng: zeroRng,
      },
    );
    const sHack = scoreSkillTemplate(
      MOVE_CATALOG.int_spike,
      DEFAULT_CORE_ATTRIBUTES,
      {
        combatBeatPhase: 'approach',
        defenderHpFraction: 0.5,
        rng: zeroRng,
      },
    );
    expect(computeRawPower(MOVE_CATALOG.basic_attack, DEFAULT_CORE_ATTRIBUTES)).toBeGreaterThan(
      computeRawPower(MOVE_CATALOG.int_spike, DEFAULT_CORE_ATTRIBUTES),
    );
    expect(sHack).toBeGreaterThan(sBasic);
  });
});
