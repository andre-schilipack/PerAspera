import {
  ID_PREFIX_BUSINESS,
  ID_PREFIX_CHARACTER,
  ID_PREFIX_COMBAT_LOG,
  ID_PREFIX_SLOT,
} from './constants.ts';

export function makeCharacterId(counter: number): string {
  return `${ID_PREFIX_CHARACTER}_${counter}`;
}

export function makeSlotId(counter: number): string {
  return `${ID_PREFIX_SLOT}_${counter}`;
}

export function makeBusinessId(counter: number): string {
  return `${ID_PREFIX_BUSINESS}_${counter}`;
}

/** Display / factory helper; persisted log lines use numeric `CombatLogEntry.id`. */
export function makeCombatLogLabel(counter: number): string {
  return `${ID_PREFIX_COMBAT_LOG}_${counter}`;
}
