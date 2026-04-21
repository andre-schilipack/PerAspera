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
  /**
   * When true (default), STA is spent and lock is applied automatically before
   * nightly defense starts if stamina allows. Persisted; older saves omit → treated as true.
   */
  autoEnlistNightlyDefense?: boolean;
  /**
   * Consumable daily limits: templateId → unix ms when the item can be used again.
   * Not visible as inventory; cleared implicitly when timestamps pass.
   */
  consumableCooldownUntilMs?: Record<string, number>;
  inventory: Item[];
  createdAt: number;
}
