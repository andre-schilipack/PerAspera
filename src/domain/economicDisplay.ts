/**
 * Player-facing economic quantities are always integers, while simulation uses floats.
 * - Stock that rises over time: show floor (partial buckets do not round up).
 * - Stock that falls over time: show ceil (partial loss still counts as the higher step until gone).
 */

/** Display for amounts that accumulate upward (generation, income stockpiles). */
export function displayEconomicIncreasing(value: number): number {
  return Math.floor(value);
}

/** Display for amounts that drain downward (energy remaining, integrity, countdowns). */
export function displayEconomicDecreasing(value: number): number {
  return Math.ceil(value);
}
