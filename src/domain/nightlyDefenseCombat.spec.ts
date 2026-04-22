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
    expect(line[0]!.tacticalBucket).toBe('front');
  });

  it('omits optional combat fields when character has no loadout snapshot', () => {
    const line = buildDefenderLineFromLocks(['x'], (id) =>
      id === 'x'
        ? { name: 'Bare', health: { current: 10, max: 10 } }
        : undefined,
    );
    expect(line[0]!.coreAttributes).toBeUndefined();
    expect(line[0]!.skillIds).toBeUndefined();
  });
});
