import type { CombatBeatPhase } from '../types/combat.ts';

export interface CombatBeatPhaseInput {
  /** Combat round index (1-based during fighting). */
  turn: number;
  attackerHpFraction: number;
  defenderHpFraction: number;
}

/**
 * Simple beat schedule: opening → sustained fight → climax when either side is low.
 */
export function combatBeatPhaseFromTurns(
  input: CombatBeatPhaseInput,
): CombatBeatPhase {
  const { turn, attackerHpFraction, defenderHpFraction } = input;
  if (attackerHpFraction <= 0.35 || defenderHpFraction <= 0.35) {
    return 'endgame';
  }
  if (turn <= 2) {
    return 'approach';
  }
  return 'contact';
}
