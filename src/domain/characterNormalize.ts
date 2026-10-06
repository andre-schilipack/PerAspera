import { sanitizeAlgoRules } from './combat/ai/algoProgram.ts';
import type { CombatPolicyMode } from './types/character.ts';
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
  skillIds: ['basic_attack', 'int_spike'],
  equippedItemInstanceIds: [],
  combatRole: 'frontline',
  policyMode: 'autoplay',
  algoRules: [],
};

/**
 * Older saves used `availableMoves`; newer shape uses {@link CombatLoadout.skillIds}.
 */
export type LegacyCharacterShape = Partial<Character> & {
  availableMoves?: string[];
};

export function clampCombatSkillIds(ids: readonly string[]): string[] {
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

function policyFields(raw: unknown): Pick<CombatLoadout, 'policyMode' | 'algoRules'> {
  const mode: CombatPolicyMode =
    isPolicyRecord(raw) && raw.policyMode === 'algo' ? 'algo' : 'autoplay';
  return {
    policyMode: mode,
    algoRules: sanitizeAlgoRules(isPolicyRecord(raw) ? raw.algoRules : undefined),
  };
}

function isPolicyRecord(value: unknown): value is { policyMode?: unknown; algoRules?: unknown } {
  return typeof value === 'object' && value !== null;
}

function mergeCombatLoadout(raw: LegacyCharacterShape): CombatLoadout {
  const fromLoadout = raw.combatLoadout;
  if (fromLoadout && Array.isArray(fromLoadout.skillIds)) {
    return {
      skillIds: clampCombatSkillIds(fromLoadout.skillIds),
      equippedItemInstanceIds: Array.isArray(
        fromLoadout.equippedItemInstanceIds,
      )
        ? [...fromLoadout.equippedItemInstanceIds]
        : [],
      combatRole:
        fromLoadout.combatRole === 'frontline' ||
        fromLoadout.combatRole === 'ranged' ||
        fromLoadout.combatRole === 'support'
          ? fromLoadout.combatRole
          : DEFAULT_COMBAT_LOADOUT.combatRole,
      ...policyFields(fromLoadout),
    };
  }

  if (raw.availableMoves && raw.availableMoves.length > 0) {
    return {
      skillIds: clampCombatSkillIds(raw.availableMoves),
      equippedItemInstanceIds: [],
      combatRole: DEFAULT_COMBAT_LOADOUT.combatRole,
      ...policyFields(undefined),
    };
  }

  return {
    skillIds: clampCombatSkillIds(DEFAULT_COMBAT_LOADOUT.skillIds),
    equippedItemInstanceIds: [...DEFAULT_COMBAT_LOADOUT.equippedItemInstanceIds],
    combatRole: DEFAULT_COMBAT_LOADOUT.combatRole,
    ...policyFields(undefined),
  };
}

/**
 * Ensures persisted or partial character records match the current {@link Character} shape.
 */
export function normalizeCharacter(raw: LegacyCharacterShape): Character {
  const { coreAttributes: rawAttrs, ...restWithLegacy } = raw;
  const rest = { ...restWithLegacy };
  delete rest.availableMoves;
  delete rest.combatLoadout;

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
