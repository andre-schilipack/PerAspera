import { describe, expect, it } from 'vitest';

import type { LegacyCharacterShape } from './characterNormalize.ts';
import {
  DEFAULT_COMBAT_LOADOUT,
  normalizeCharacter,
} from './characterNormalize.ts';
import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';

const now = 1_700_000_000_000;

function legacyBase(over: LegacyCharacterShape = {}): LegacyCharacterShape {
  return {
    id: 'c1',
    name: 'Test',
    age: 16,
    level: 1,
    exp: 0,
    creds: 0,
    stamina: { current: 200, max: 240, lastUpdated: now },
    health: { current: 42, max: 42, lastUpdated: now },
    score: 0,
    reputation: 0,
    homeHexId: '0,0',
    currentHexId: '0,0',
    currentDefenseContribution: 0,
    inventory: [],
    createdAt: now,
    ...over,
  };
}

describe('normalizeCharacter', () => {
  it('maps legacy availableMoves to combatLoadout.skillIds', () => {
    const normalized = normalizeCharacter(
      legacyBase({
        availableMoves: ['basic_attack', 'basic_attack'],
      }),
    );

    expect(normalized.combatLoadout.skillIds).toEqual(['basic_attack']);
    expect(normalized.coreAttributes).toEqual(DEFAULT_CORE_ATTRIBUTES);
  });

  it('prefers persisted combatLoadout over availableMoves', () => {
    const normalized = normalizeCharacter(
      legacyBase({
        availableMoves: ['basic_attack'],
        combatLoadout: {
          skillIds: ['basic_attack'],
          equippedItemInstanceIds: [],
        },
      }),
    );

    expect(normalized.combatLoadout.skillIds).toEqual(['basic_attack']);
  });

  it('fills combat defaults when legacy lists are absent', () => {
    const normalized = normalizeCharacter(legacyBase());

    expect(normalized.combatLoadout.skillIds).toEqual(
      DEFAULT_COMBAT_LOADOUT.skillIds,
    );
    expect(normalized.coreAttributes).toEqual(DEFAULT_CORE_ATTRIBUTES);
  });
});
