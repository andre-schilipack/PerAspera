import type { Item } from './items.ts';
import type { CoreAttributes } from './attributes.ts';
import type { MoveTemplateId } from './combat.ts';

export type { CoreAttributes } from './attributes.ts';

export interface StaminaState {
  current: number;
  max: number;
  /** Single source of truth for offline regen (unix ms). */
  lastUpdated: number;
}

/** Persistent combat vitality (HP regen and future combat hooks). */
export interface CharacterHealth {
  current: number;
  max: number;
  /** For passive HP regen (offline-friendly), same idea as stamina. */
  lastUpdated: number;
}

/**
 * Deck-style combat configuration. `skillIds` reference {@link MoveTemplateId} catalog keys.
 * `equippedItemInstanceIds` reserved for weapon/gear hooks (inventory item ids).
 */
export interface CombatLoadout {
  skillIds: MoveTemplateId[];
  /** Future: gear that modifies autoplay / damage (item instance ids). */
  equippedItemInstanceIds: string[];
  /** Slice 7: simple role selector for auto-placement in combat. */
  combatRole?: 'frontline' | 'ranged' | 'support';
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
  /** Baseline stats; scaling for exp/leveling comes later (MVP: all 1). */
  coreAttributes: CoreAttributes;
  combatLoadout: CombatLoadout;
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
