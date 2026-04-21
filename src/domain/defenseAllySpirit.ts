import {
  ALLY_SPIRIT_FRONT_GAP,
  ALLY_SPIRIT_MAX,
  ALLY_SPIRIT_MORALE_SHOCK_THRESHOLD,
  MORALE_SHOCK_DURATION_TURNS,
  MORALE_SHOCK_OUTGOING_DAMAGE_FACTOR,
} from './constants.ts';
import type { DefenseTacticalBucket } from './types/combat.ts';
import { countLivingInBucket, livingEnemyCount } from './defenseTactics.ts';

export function clampAllySpirit(value: number): number {
  return Math.max(0, Math.min(ALLY_SPIRIT_MAX, Math.round(value)));
}

export function allySpiritOutgoingDamageMultiplier(
  moraleShockTurnsRemaining: number,
): number {
  return moraleShockTurnsRemaining > 0
    ? MORALE_SHOCK_OUTGOING_DAMAGE_FACTOR
    : 1;
}

export function maybeTriggerMoraleShock(params: {
  allySpirit: number;
  moraleShockTurnsRemaining: number;
  rng: () => number;
  defenderHitsThisRound: number;
}): { moraleShockTurnsRemaining: number; triggered: boolean } {
  const { allySpirit, moraleShockTurnsRemaining, rng, defenderHitsThisRound } =
    params;
  let next = moraleShockTurnsRemaining;
  let triggered = false;

  const lowSpirit =
    allySpirit <= ALLY_SPIRIT_MORALE_SHOCK_THRESHOLD &&
    rng() < 0.55;
  const pressured =
    defenderHitsThisRound >= 2 && rng() < 0.12;

  if (lowSpirit || pressured) {
    next = MORALE_SHOCK_DURATION_TURNS;
    triggered = true;
  }

  return { moraleShockTurnsRemaining: next, triggered };
}

export function decrementMoraleShock(
  moraleShockTurnsRemaining: number,
): number {
  return Math.max(0, moraleShockTurnsRemaining - 1);
}

export function evaluateFrontGapSpiritDelta(
  enemies: readonly {
    currentHealth: number;
    tacticalBucket?: DefenseTacticalBucket;
  }[],
): number {
  if (livingEnemyCount(enemies) === 0) return 0;
  const frontAlive = countLivingInBucket(enemies, 'front');
  if (frontAlive === 0) return ALLY_SPIRIT_FRONT_GAP;
  return 0;
}
