import type { Item } from './items.ts';

export interface StaminaState {
  current: number;
  max: number;
  /** Single source of truth for offline regen (unix ms). */
  lastUpdated: number;
}

/** Persistent combat vitality (synced after skirmish / future systems). */
export interface CharacterHealth {
  current: number;
  max: number;
  /** For passive HP regen (offline-friendly), same idea as stamina. */
  lastUpdated: number;
}

export interface Character {
  id: string;
  name: string;
  age: number;
  level: number;
  exp: number;
  creds: number;
  stamina: StaminaState;
  health: CharacterHealth;
  score: number;
  reputation: number;
  homeHexId: string;
  /** Current position on the hex map (axial key `q,r`). */
  currentHexId: string;
  availableMoves: string[];
  /** Resets with daily defense bookkeeping. */
  currentDefenseContribution: number;
  inventory: Item[];
  createdAt: number;
}
