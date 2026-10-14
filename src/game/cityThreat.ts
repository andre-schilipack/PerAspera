import {
  CITY_THREAT_GROWTH_PER_DAY,
  INITIAL_CITY_THREAT_LEVEL,
} from '../domain/constants.ts';
import { growCityThreatLevel } from '../domain/enemyThreat.ts';
import { useCityStore } from '../stores/useCityStore.ts';

/** Read campaign threat (defaults for older in-memory state). */
export function readCityThreatLevel(): number {
  const raw = useCityStore.getState().cityThreatLevel;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw);
  return INITIAL_CITY_THREAT_LEVEL;
}

/**
 * Grow nest pressure when a new defense calendar day begins.
 * Returns the threat level to use for that day's wave.
 */
export function growCityThreatForNewDefenseDay(): number {
  const next = growCityThreatLevel(
    readCityThreatLevel(),
    CITY_THREAT_GROWTH_PER_DAY,
  );
  useCityStore.getState().setCityThreatLevel(next);
  return next;
}
