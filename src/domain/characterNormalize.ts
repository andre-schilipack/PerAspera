import {
  DEFAULT_CORE_ATTRIBUTES,
  type CoreAttributes,
} from './types/attributes.ts';
import type { Character, CombatLoadout } from './types/character.ts';
import {
  MAX_COMBAT_SKILL_SLOTS,
} from './constants.ts';

/** Starter skills when none are persisted (catalog must define these ids). */
export const DEFAULT_COMBAT_LOADOUT: CombatLoadout = {
  skillIds: ['basic_attack'],
  equippedItemInstanceIds: [],
};

/**
 * Older saves used `availableMoves`; newer shape uses {@link CombatLoadout.skillIds}.
 */
export type LegacyCharacterShape = Partial<Character> & {
  availableMoves?: string[];
};

function clampSkillIds(ids: readonly string[]): string[] {
  const dedup = [...new Set(ids)].filter(Boolean);
  return dedup.slice(0, MAX_COMBAT_SKILL_SLOTS);
}

function mergeCoreAttributes(raw?: Partial<CoreAttributes>): CoreAttributes {
  return {
    strength: raw?.strength ?? DEFAULT_CORE_ATTRIBUTES.strength,
    agility: raw?.agility ?? DEFAULT_CORE_ATTRIBUTES.agility,
    intelligence: raw?.intelligence ?? DEFAULT_CORE_ATTRIBUTES.intelligence,
    vitality: raw?.vitality ?? DEFAULT_CORE_ATTRIBUTES.vitality,
    charisma: raw?.charisma ?? DEFAULT_CORE_ATTRIBUTES.charisma,
    willpower: raw?.willpower ?? DEFAULT_CORE_ATTRIBUTES.willpower,
  };
}

function mergeCombatLoadout(raw: LegacyCharacterShape): CombatLoadout {
  const fromLoadout = raw.combatLoadout;
  if (fromLoadout && Array.isArray(fromLoadout.skillIds)) {
    return {
      skillIds: clampSkillIds(fromLoadout.skillIds),
      equippedItemInstanceIds: Array.isArray(
        fromLoadout.equippedItemInstanceIds,
      )
        ? [...fromLoadout.equippedItemInstanceIds]
        : [],
    };
  }

  if (raw.availableMoves && raw.availableMoves.length > 0) {
    return {
      skillIds: clampSkillIds(raw.availableMoves),
      equippedItemInstanceIds: [],
    };
  }

  return {
    skillIds: clampSkillIds(DEFAULT_COMBAT_LOADOUT.skillIds),
    equippedItemInstanceIds: [...DEFAULT_COMBAT_LOADOUT.equippedItemInstanceIds],
  };
}

/**
 * Ensures persisted or partial character records match the current {@link Character} shape.
 */
export function normalizeCharacter(raw: LegacyCharacterShape): Character {
  const {
    availableMoves: _omit,
    combatLoadout: _omitLoad,
    coreAttributes: rawAttrs,
    ...rest
  } = raw;

  const base = rest as Omit<
    Character,
    'coreAttributes' | 'combatLoadout' | 'availableMoves'
  >;

  return {
    ...base,
    coreAttributes: mergeCoreAttributes(rawAttrs),
    combatLoadout: mergeCombatLoadout(raw),
  };
}
