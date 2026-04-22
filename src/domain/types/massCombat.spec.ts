import { describe, expect, it } from 'vitest';
import {
  massCombatActiveStrikeTargets,
  massCombatModeFlagsNightlyWall,
  massCombatModeFlagsPrefeituraSiege,
  massCombatStructuralPresent,
} from './massCombat.ts';

describe('massCombat helpers', () => {
  it('structural present is false only for none', () => {
    expect(massCombatStructuralPresent('none')).toBe(false);
    expect(massCombatStructuralPresent('wall')).toBe(true);
    expect(massCombatStructuralPresent('prefeitura')).toBe(true);
  });

  it('ally-only strike list when no structure', () => {
    expect(massCombatActiveStrikeTargets('none')).toEqual(['ally']);
  });

  it('structure and ally when a structural layer exists', () => {
    expect(massCombatActiveStrikeTargets('wall')).toEqual([
      'structure',
      'ally',
    ]);
    expect(massCombatActiveStrikeTargets('prefeitura')).toEqual([
      'structure',
      'ally',
    ]);
  });

  it('mode flags match retreat rules for each theater', () => {
    expect(massCombatModeFlagsNightlyWall().applyDefenderRetreatRules).toBe(
      true,
    );
    expect(
      massCombatModeFlagsPrefeituraSiege().applyDefenderRetreatRules,
    ).toBe(false);
  });
});
