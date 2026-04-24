import type { EnemyInstance } from './types/combat.ts';
import type { DailyDefenseState, DefenderLineEntry } from './types/defense.ts';
import type { HexMap } from './types/map.ts';

import {
  type EncounterCombatRoundResult,
  type EncounterCombatTheater,
  runEncounterCombatRound,
  type RunEncounterCombatRoundArgs,
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

/** City map for structural features (`wall` on target hex, `city_hall` on Centro). */
export interface EncounterCombatStructuresBundle {
  hexMap: HexMap;
}

/**
 * One combat round input: theater mode, RNG, participant arrays, structures,
 * and the persisted defense session slice (`daily`) for spirit, turn counter, etc.
 */
export interface EncounterCombatRoundInput {
  theater: EncounterCombatTheater;
  rng: () => number;
  allies: readonly EncounterCombatAlly[];
  enemies: readonly EncounterCombatEnemy[];
  /**
   * When set, documents which NPC-ally preset to use; only `mass_defense_standard`
   * is implemented (optional — omit for the same behavior).
   */
  npcAllies?: EncounterNpcAlliesPreset;
  structures: EncounterCombatStructuresBundle;
  /** Daily defense session — merged with explicit allies/enemies for this round. */
  session: {
    daily: DailyDefenseState;
  };
}

function toRunEncounterCombatRoundArgs(
  input: EncounterCombatRoundInput,
): RunEncounterCombatRoundArgs {
  const allies = [...input.allies];
  const enemies = [...input.enemies];
  const dailyForRound: DailyDefenseState = {
    ...input.session.daily,
    enemies,
    defenderLine: allies,
  };

  return {
    daily: dailyForRound,
    hexMap: input.structures.hexMap,
    rng: input.rng,
    defenderLine: allies,
    structureMode: input.theater,
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
