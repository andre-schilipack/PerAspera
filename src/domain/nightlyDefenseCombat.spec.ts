import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import { buildDefenderLineFromLocks } from './nightlyDefenseCombat.ts';

describe('buildDefenderLineFromLocks', () => {
  it('copies coreAttributes and skillIds when present on character', () => {
    const line = buildDefenderLineFromLocks(['a'], (id) =>
      id === 'a'
        ? {
            name: 'Test',
            health: { current: 20, max: 20 },
            coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 3 },
            combatLoadout: { skillIds: ['basic_attack', 'int_spike'] },
          }
        : undefined,
    );
    expect(line).toHaveLength(1);
    expect(line[0]!.coreAttributes?.strength).toBe(3);
    expect(line[0]!.skillIds).toEqual(['basic_attack', 'int_spike']);
    expect(line[0]!.algoProgram).toBeUndefined();
    expect(line[0]!.tacticalBucket).toBe('front');
    expect(line[0]!.combatState).toEqual({ cooldowns: {}, statuses: {} });
  });

  it('omits optional combat fields when character has no loadout snapshot', () => {
    const line = buildDefenderLineFromLocks(['x'], (id) =>
      id === 'x'
        ? { name: 'Bare', health: { current: 10, max: 10 } }
        : undefined,
    );
    expect(line[0]!.coreAttributes).toBeUndefined();
    expect(line[0]!.skillIds).toBeUndefined();
    expect(line[0]!.algoProgram).toBeUndefined();
  });

  it('copies an AlgoCombat program only when the loadout mode is algo', () => {
    const line = buildDefenderLineFromLocks(['a'], () => ({
      name: 'Scripted',
      health: { current: 20, max: 20 },
      combatLoadout: {
        skillIds: ['cure'],
        policyMode: 'algo' as const,
        algoRules: [
          {
            enabled: true,
            when: { kind: 'self' as const },
            do: { kind: 'skill' as const, skillId: 'cure' },
          },
        ],
      },
    }));
    expect(line[0]!.algoProgram?.rules).toHaveLength(1);
    expect(line[0]!.algoProgram?.rules[0]?.do).toEqual({
      kind: 'skill',
      skillId: 'cure',
    });
  });
});
