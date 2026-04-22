import { describe, expect, it } from 'vitest';

import { getMoveTemplate } from '../../content/catalogs/moves.ts';
import { DEFAULT_CORE_ATTRIBUTES } from '../types/attributes.ts';

import {
  pickAutoplayMoveTemplate,
  resolveMoveTemplateStrike,
} from './autoplayStrike.ts';

describe('autoplayStrike', () => {
  it('pickAutoplayMoveTemplate falls back to basic_attack', () => {
    const t = pickAutoplayMoveTemplate(
      [],
      getMoveTemplate,
      DEFAULT_CORE_ATTRIBUTES,
      {
        combatBeatPhase: 'contact',
        defenderHpFraction: 0.5,
        rng: () => 0.5,
      },
    );
    expect(t.id).toBe('basic_attack');
  });

  it('resolveMoveTemplateStrike applies multiplier after raw power', () => {
    const template = getMoveTemplate('basic_attack')!;
    const r = resolveMoveTemplateStrike({
      template,
      attackerAttributes: DEFAULT_CORE_ATTRIBUTES,
      defenderReceivingStrike: { ...DEFAULT_CORE_ATTRIBUTES, agility: 0, vitality: 0 },
      rng: () => 0.99,
      strikePowerMultiplier: 2,
    });
    expect(r.flags.dodged).toBe(false);
    expect(r.finalDamage).toBe(20);
  });
});
