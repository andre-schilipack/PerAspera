import {
  BASE_MELEE_BLOCK_CHANCE,
  BASE_MELEE_DODGE_CHANCE,
} from '../constants.ts';
import { resolveIncomingMeleeDamage } from '../combatResolution.ts';
import type { CoreAttributes } from '../types/attributes.ts';
import type { MoveDamageKind } from '../types/combat.ts';
import type { MeleeResolveResult } from '../combatResolution.ts';

/** Stub for future armor/resists per damage kind (1 = no change). */
export function damageKindResistanceMultiplier(_kind: MoveDamageKind): number {
  return 1;
}

/**
 * Defender dodge/block chances scale slightly with Agility / Vitality (caps avoid runaway RNG).
 */
export function mitigationFromAttributes(defender: CoreAttributes): {
  dodgeChance: number;
  blockChance: number;
} {
  const dodgeChance = Math.min(
    0.38,
    BASE_MELEE_DODGE_CHANCE + defender.agility * 0.02,
  );
  const blockChance = Math.min(
    0.38,
    BASE_MELEE_BLOCK_CHANCE + defender.vitality * 0.015,
  );
  return { dodgeChance, blockChance };
}

/**
 * Applies kind resistance (future) then dodge/block resolution (same mechanical pipeline for MVP).
 */
export function resolveStrikeDamage(
  rawDamage: number,
  damageKind: MoveDamageKind,
  defender: CoreAttributes,
  rng: () => number,
): MeleeResolveResult {
  const kindMul = damageKindResistanceMultiplier(damageKind);
  const scaled = Math.max(0, Math.floor(rawDamage * kindMul));
  const { dodgeChance, blockChance } = mitigationFromAttributes(defender);
  return resolveIncomingMeleeDamage(scaled, rng, {
    dodgeChance,
    blockChance,
  });
}
