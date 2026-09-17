import {
  PATROL_ENCOUNTER_BASE_CHANCE,
  PATROL_ENCOUNTER_CHANCE_CAP,
  PATROL_ENCOUNTER_DANGER_WEIGHT,
} from './constants.ts';

/**
 * Probability (0–1) of a random street encounter when entering a hex,
 * from district danger (0–100). Capped for fairness.
 */
export function encounterChanceFromDanger(danger: number): number {
  const d = Math.max(0, Math.min(100, danger));
  const extra = (d / 100) * PATROL_ENCOUNTER_DANGER_WEIGHT;
  return Math.min(PATROL_ENCOUNTER_CHANCE_CAP, PATROL_ENCOUNTER_BASE_CHANCE + extra);
}

export interface RollPatrolEncounterInput {
  /** Destination hex danger (0–100). */
  danger: number;
  /** Returns uniform random in [0, 1). Injectable for tests. */
  random: () => number;
}

/**
 * One roll after a successful patrol move into {@link danger} territory.
 */
export function rollPatrolEncounter(input: RollPatrolEncounterInput): boolean {
  return input.random() < encounterChanceFromDanger(input.danger);
}

/**
 * Human-readable percent for UI (e.g. map tooltips).
 */
export function formatEncounterChancePercent(danger: number): string {
  const p = encounterChanceFromDanger(danger);
  return `${Math.round(p * 100)}%`;
}
