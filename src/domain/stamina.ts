import { MS_PER_DAY, STAMINA_REGEN_PER_24H } from './constants.ts';

export interface ApplyOfflineRegenParams {
  current: number;
  max: number;
  lastUpdated: number;
  /** Usually `Date.now()` from the runtime / bootstrap. */
  now: number;
}

export interface ApplyOfflineRegenResult {
  current: number;
  lastUpdated: number;
}

/**
 * Linear passive regen: {@link STAMINA_REGEN_PER_24H} points over each full 24h window.
 * Clamps to `max` and advances `lastUpdated` when any whole STA was gained.
 */
export function applyOfflineRegen(
  params: ApplyOfflineRegenParams,
): ApplyOfflineRegenResult {
  const { current, max, lastUpdated, now } = params;
  const clampedCurrent = Math.min(current, max);

  if (now <= lastUpdated) {
    return { current: clampedCurrent, lastUpdated };
  }

  const elapsed = now - lastUpdated;
  const regenPerMs = STAMINA_REGEN_PER_24H / MS_PER_DAY;
  const gained = Math.floor(elapsed * regenPerMs);

  if (gained <= 0) {
    return { current: clampedCurrent, lastUpdated };
  }

  return {
    current: Math.min(max, clampedCurrent + gained),
    lastUpdated: now,
  };
}
