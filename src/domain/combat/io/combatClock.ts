/** Battle clock: one simulation tick is 0.1 seconds of fight time. */
export const COMBAT_TICK_SECONDS = 0.1;

/**
 * Format a combat tick as fight time (e.g. tick 10 → "1.0s", tick 23 → "2.3s").
 * Playback pacing is independent of this scale.
 */
export function formatCombatClock(tick: number): string {
  const t = Number.isFinite(tick) ? tick : 0;
  const seconds = t * COMBAT_TICK_SECONDS;
  return `${seconds.toFixed(1)}s`;
}
