import type { CombatLogEntry } from './combat.ts';
import type { HexMap } from './map.ts';

/**
 * Mass combat (nightly defense, Prefeitura siege, future ally-only fights) shares one
 * resolver contract: injected RNG, monotonic turn counter, and append-only combat log lines.
 *
 * ## RNG contract
 * - Callers pass `rng: () => number` returning values in **[0, 1)**.
 * - The same function instance should be used for every roll inside one round when simulating
 *   or testing so outcomes stay reproducible.
 *
 * ## Phase order (current nightly wall — reference)
 * 1. Early exit if session not fighting / completed.
 * 2. Victory shortcut if no enemies remain.
 * 3. Increment turn; emit round header + bucket pressure snapshot.
 * 4. Ally-side NPC strikes (tower, optional guards).
 * 5. Living defenders strike enemies (aggregated buckets).
 * 6. Remove dead enemies; update ally spirit from kills / front gap.
 * 7. Enemy strike cycle (alternates structure vs defenders per slot rules).
 * 8. Morale shock + ally spirit delta lines; terminal outcome (breach / victory / etc.).
 *
 * Prefeitura siege reuses (4)–(8) with a different structural target and strike cycle.
 */

/** Structural sink present in this combat theater (wall sector, Prefeitura, or none). */
export type MassCombatStructuralPresence = 'wall' | 'prefeitura' | 'none';

/**
 * Semantic target class for hostile strikes in a round.
 * - `structure`: damage applies to wall section or Prefeitura structural HP.
 * - `ally`: damage applies to defender line (or equivalent ally entities).
 * When {@link MassCombatStructuralPresence} is `none`, only `ally` strikes apply (no structural branch).
 */
export type CombatStrikeTargetKind = 'structure' | 'ally';

/** Flags that change rules without changing participant lists (retreat, last stand, …). */
export interface MassCombatModeFlags {
  /**
   * When true, defenders who drop below retreat HP fraction leave the line (nightly wall).
   * When false, living defenders keep fighting (Prefeitura last stand).
   */
  applyDefenderRetreatRules: boolean;
}

export interface MassCombatWallSnapshot {
  /** Present when structural HP changed this round (wall tile or Centro siege). */
  hexMap?: HexMap;
  /** True when nightly perimeter wall pool on the target hex reaches 0. */
  breached: boolean;
}

/**
 * Shared input shape for a single mass-combat round (future engine entry point).
 * Not all fields are required by every caller today; Etapa 1 fixes the contract for later wiring.
 */
export interface MassCombatRoundConfig {
  /** Which structural layer exists for this theater, if any. */
  structuralPresence: MassCombatStructuralPresence;
  /** Injected RNG — see module docblock. */
  rng: () => number;
  /** Resolver turn index after increment (matches `DailyDefenseState.currentTurn` once applied). */
  turn: number;
  /** Single timestamp for all log lines in this round (grouped reveal / ordering). */
  roundTimestampMs: number;
  mode: MassCombatModeFlags;
}

/**
 * Minimal delta every mass-combat round produces before IDs are assigned by the game layer.
 */
export interface MassCombatRoundResultBase {
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
  wallResult: MassCombatWallSnapshot;
}

/** Full round result including the next daily snapshot (domain-specific). */
export type MassCombatRoundResult<TDaily = unknown> = MassCombatRoundResultBase & {
  nextDaily: TDaily;
};

export function massCombatStructuralPresent(
  presence: MassCombatStructuralPresence,
): boolean {
  return presence !== 'none';
}

/** Strike target kinds that participate in the hostile phase for this structural presence. */
export function massCombatActiveStrikeTargets(
  presence: MassCombatStructuralPresence,
): readonly CombatStrikeTargetKind[] {
  if (presence === 'none') return ['ally'];
  return ['structure', 'ally'];
}

export function massCombatStructuralPresenceNightlyWall(): MassCombatStructuralPresence {
  return 'wall';
}

export function massCombatStructuralPresencePrefeituraSiege(): MassCombatStructuralPresence {
  return 'prefeitura';
}

export function massCombatModeFlagsNightlyWall(): MassCombatModeFlags {
  return { applyDefenderRetreatRules: true };
}

export function massCombatModeFlagsPrefeituraSiege(): MassCombatModeFlags {
  return { applyDefenderRetreatRules: false };
}
