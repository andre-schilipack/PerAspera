import type { EnemyInstance } from './types/combat.ts';
import type { DailyDefenseState, DefenderLineEntry, WallState } from './types/defense.ts';
import type { HexMap } from './types/map.ts';

import {
  type MassDefenseCombatRoundResult,
  type MassDefenseStructureMode,
  runMassDefenseCombatRound,
  type RunMassDefenseCombatRoundArgs,
} from './massDefenseRound.ts';

/**
 * Unified encounter combat API: one round resolver with explicit participant arrays
 * (allies, enemies) plus optional NPC allies / structure bundles.
 *
 * Implementation delegates to {@link runMassDefenseCombatRound}; this module is the
 * supported entry point for game features so theater-specific wrappers stay thin.
 */

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

/** Wall integrity + optional downtown map for Prefeitura structural HP. */
export interface EncounterStructuresBundle {
  wall: WallState;
  /** Required when {@link EncounterCombatRoundInput.theater} is `prefeitura_siege`. */
  hexMap?: HexMap;
}

/**
 * One combat round input: theater mode, RNG, participant arrays, structures,
 * and the persisted defense session slice (`daily`) for spirit, turn counter, etc.
 */
export interface EncounterCombatRoundInput {
  theater: MassDefenseStructureMode;
  rng: () => number;
  allies: readonly EncounterCombatAlly[];
  enemies: readonly EncounterCombatEnemy[];
  /**
   * When set, documents which NPC-ally preset to use; only `mass_defense_standard`
   * is implemented (optional — omit for the same behavior).
   */
  npcAllies?: EncounterNpcAlliesPreset;
  structures: EncounterStructuresBundle;
  /** Daily defense session — merged with explicit allies/enemies for this round. */
  session: {
    daily: DailyDefenseState;
  };
}

function toRunMassDefenseCombatRoundArgs(
  input: EncounterCombatRoundInput,
): RunMassDefenseCombatRoundArgs {
  const allies = [...input.allies];
  const enemies = [...input.enemies];
  const dailyForRound: DailyDefenseState = {
    ...input.session.daily,
    enemies,
    defenderLine: allies,
  };

  const base = {
    daily: dailyForRound,
    wall: input.structures.wall,
    rng: input.rng,
    defenderLine: allies,
  };

  if (input.theater === 'prefeitura_siege') {
    const hexMap = input.structures.hexMap;
    if (!hexMap) {
      throw new Error(
        'encounterCombat: structures.hexMap is required when theater is prefeitura_siege',
      );
    }
    return {
      ...base,
      structureMode: 'prefeitura_siege' as const,
      hexMap,
    };
  }

  return {
    ...base,
    structureMode: 'nightly_wall' as const,
  };
}

export interface EncounterCombatHandle {
  /** Runs one round using the shared mass-defense resolver. */
  advanceRound: (input: EncounterCombatRoundInput) => MassDefenseCombatRoundResult;
}

/**
 * Factory for encounter combat rounds. Reserved for future dependency injection
 * (custom NPC ally definitions, template lookup, etc.).
 */
export function createEncounterCombat(): EncounterCombatHandle {
  return {
    advanceRound(input: EncounterCombatRoundInput): MassDefenseCombatRoundResult {
      return runMassDefenseCombatRound(toRunMassDefenseCombatRoundArgs(input));
    },
  };
}

/** Default runner — same as `createEncounterCombat().advanceRound`. */
export function advanceEncounterCombatRound(
  input: EncounterCombatRoundInput,
): MassDefenseCombatRoundResult {
  return createEncounterCombat().advanceRound(input);
}
