import type { EnemyInstance } from './types/combat.ts';
import type { DefenderLineEntry } from './types/defense.ts';
import type { AlliedStructure, EncounterSessionConfig } from './types/encounter.ts';
import type { HexMap } from './types/map.ts';

import type { CombatRoundContinuation, RunEncounterCombatRoundArgs } from './encounterCombatTypes.ts';
import {
  type EncounterCombatRoundResult,
  runEncounterCombatRound,
} from './encounterCombatRound.ts';

/** Player-side combatants (defender line: skills, HP, tactical bucket). */
export type EncounterCombatAlly = DefenderLineEntry;

/** Hostile units in this encounter. */
export type EncounterCombatEnemy = EnemyInstance;

/**
 * NPC allies (tower emplacement, guards, etc.). When omitted, mass-defense defaults
 * apply (see DEFENSE_NPC_* constants inside the round resolver).
 */
export type EncounterNpcAlliesPreset = {
  preset: 'mass_defense_standard';
};

export type { AlliedStructure, EncounterSessionConfig } from './types/encounter.ts';
export type { CombatRoundContinuation, EncounterCombatStateDelta } from './encounterCombatTypes.ts';

/** City map for structural features (`wall` and `city_hall` on tiles). */
export interface EncounterCombatStructuresBundle {
  hexMap: HexMap;
}

/**
 * One combat round: RNG, participant lists, per-round continuation state, which ally
 * structures participate, optional session config. Session merge (`DailyDefenseState`)
 * is performed outside the resolver.
 */
export interface EncounterCombatRoundInput {
  rng: () => number;
  allies: readonly EncounterCombatAlly[];
  enemies: readonly EncounterCombatEnemy[];
  /**
   * Structural / civic targets for this round (e.g. `wall` on the raid hex,
   * `city_hall` on Centro). Drives strike cycles and outcomes.
   */
  alliedStructures: ReadonlyArray<AlliedStructure>;
  /**
   * When set, documents which NPC-ally preset to use; only `mass_defense_standard`
   * is implemented (optional — omit for the same behavior).
   */
  npcAllies?: EncounterNpcAlliesPreset;
  /** Optional: `noRetreat` and future flags. If omitted, retreat defaults from `alliedStructures`. */
  sessionConfig?: EncounterSessionConfig;
  structures: EncounterCombatStructuresBundle;
  /**
   * Turn, spirit, outcome, phase, and wall-hex fallback — not a full `DailyDefenseState`.
   */
  continuation: CombatRoundContinuation;
}

function toRunEncounterCombatRoundArgs(
  input: EncounterCombatRoundInput,
): RunEncounterCombatRoundArgs {
  const allies = [...input.allies];
  const enemies = [...input.enemies];

  return {
    hexMap: input.structures.hexMap,
    rng: input.rng,
    enemies,
    defenderLine: allies,
    alliedStructures: input.alliedStructures,
    sessionConfig: input.sessionConfig,
    continuation: input.continuation,
  };
}

export interface EncounterCombatHandle {
  advanceRound: (input: EncounterCombatRoundInput) => EncounterCombatRoundResult;
}

/**
 * Factory for encounter combat rounds. Reserved for future dependency injection
 * (custom NPC ally definitions, template lookup, etc.).
 */
export function createEncounterCombat(): EncounterCombatHandle {
  return {
    advanceRound(input: EncounterCombatRoundInput): EncounterCombatRoundResult {
      return runEncounterCombatRound(toRunEncounterCombatRoundArgs(input));
    },
  };
}

/** Default runner — same as `createEncounterCombat().advanceRound`. */
export function advanceEncounterCombatRound(
  input: EncounterCombatRoundInput,
): EncounterCombatRoundResult {
  return createEncounterCombat().advanceRound(input);
}
