import { HEALTH_REGEN_PER_24H, MS_PER_DAY } from './constants.ts';

import type { CharacterHealth } from './types/character.ts';

export interface ApplyOfflineHealthRegenParams {
  current: number;
  max: number;
  lastUpdated: number;
  now: number;
}

export interface ApplyOfflineHealthRegenResult {
  current: number;
  lastUpdated: number;
}

/**
 * Linear passive HP regen: {@link HEALTH_REGEN_PER_24H} over each full 24h window.
 * Clamps to `max` and advances `lastUpdated` when any whole HP was gained.
 */
export function applyOfflineHealthRegen(
  params: ApplyOfflineHealthRegenParams,
): ApplyOfflineHealthRegenResult {
  const { current, max, lastUpdated, now } = params;
  const clampedCurrent = Math.min(current, max);

  if (now <= lastUpdated) {
    return { current: clampedCurrent, lastUpdated };
  }

  const elapsed = now - lastUpdated;
  const regenPerMs = HEALTH_REGEN_PER_24H / MS_PER_DAY;
  const gained = Math.floor(elapsed * regenPerMs);

  if (gained <= 0) {
    return { current: clampedCurrent, lastUpdated };
  }

  return {
    current: Math.min(max, clampedCurrent + gained),
    lastUpdated: now,
  };
}

/**
 * Fractional HP expected at `now` (for UI). Persisted `current` still advances
 * in whole steps via {@link applyOfflineHealthRegen}.
 */
export function healthVisualCurrentAt(
  health: CharacterHealth,
  now: number,
): number {
  const { current, max, lastUpdated } = health;
  const clamped = Math.min(current, max);
  if (now <= lastUpdated) return clamped;
  const elapsed = now - lastUpdated;
  const regenPerMs = HEALTH_REGEN_PER_24H / MS_PER_DAY;
  return Math.min(max, clamped + elapsed * regenPerMs);
}
