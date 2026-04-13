import {
  BASE_MELEE_BLOCK_CHANCE,
  BASE_MELEE_DODGE_CHANCE,
  BLOCK_DAMAGE_FACTOR,
} from './constants.ts';

export type MeleeResolveFlags = {
  dodged: boolean;
  blocked: boolean;
};

export interface MeleeResolveResult {
  /** Rounded down damage applied to the defender. */
  finalDamage: number;
  flags: MeleeResolveFlags;
}

/**
 * Resolve incoming melee damage: dodge first (full avoid), then block (mitigate).
 * `rng` must return uniform [0, 1).
 */
export function resolveIncomingMeleeDamage(
  rawDamage: number,
  rng: () => number,
  options?: {
    dodgeChance?: number;
    blockChance?: number;
    blockFactor?: number;
  },
): MeleeResolveResult {
  const d = Math.max(0, rawDamage);
  if (d <= 0) {
    return { finalDamage: 0, flags: { dodged: false, blocked: false } };
  }

  const dodgeChance = options?.dodgeChance ?? BASE_MELEE_DODGE_CHANCE;
  const blockChance = options?.blockChance ?? BASE_MELEE_BLOCK_CHANCE;
  const blockFactor = options?.blockFactor ?? BLOCK_DAMAGE_FACTOR;

  if (rng() < dodgeChance) {
    return { finalDamage: 0, flags: { dodged: true, blocked: false } };
  }

  if (rng() < blockChance) {
    const mitigated = Math.max(0, Math.floor(d * blockFactor));
    return {
      finalDamage: mitigated,
      flags: { dodged: false, blocked: true },
    };
  }

  return {
    finalDamage: Math.max(0, Math.floor(d)),
    flags: { dodged: false, blocked: false },
  };
}
