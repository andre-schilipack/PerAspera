import type { EnemyInstance } from './types/combat.ts';
import type { DefenderLineEntry, NightlyDefenseOutcome, NightlyDefensePhase } from './types/defense.ts';
import type { AlliedStructure, EncounterSessionConfig } from './types/encounter.ts';
import type { HexMap } from './types/map.ts';
/**
 * Per-round state carried into the encounter resolver (no full session blob).
 * `currentTurn` is the index **before** this round; the displayed / logged round uses +1.
 */
export interface CombatRoundContinuation {
  currentTurn: number;
  outcome: NightlyDefenseOutcome;
  phase: NightlyDefensePhase;
  /** If omitted, defaults to initial ally spirit (see ALLY_SPIRIT_INITIAL in constants). */
  allySpirit?: number;
  /** If omitted, defaults to 0. */
  moraleShockTurnsRemaining?: number;
  /**
   * When `alliedStructures` has no `wall` entry, this hex id is used for wall strikes
   * (e.g. breach raid `targetHexId` from the defense session).
   */
  wallHexFallback?: string;
}

/** State fields the round updates; merge into `DailyDefenseState` in the session layer. */
export interface EncounterCombatStateDelta {
  currentTurn: number;
  enemies: EnemyInstance[];
  defenderLine: DefenderLineEntry[];
  totalEnemyPoints: number;
  outcome: NightlyDefenseOutcome;
  phase: NightlyDefensePhase;
  isCompleted: boolean;
  allySpirit: number;
  moraleShockTurnsRemaining: number;
}

export interface RunEncounterCombatRoundArgs {
  hexMap: HexMap;
  rng: () => number;
  enemies: readonly EnemyInstance[];
  defenderLine: DefenderLineEntry[];
  alliedStructures: ReadonlyArray<AlliedStructure>;
  sessionConfig?: EncounterSessionConfig;
  continuation: CombatRoundContinuation;
}
