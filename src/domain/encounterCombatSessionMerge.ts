import type { DailyDefenseState } from './types/defense.ts';
import type { EncounterCombatStateDelta } from './encounterCombatTypes.ts';

/**
 * Merges combat output into a prior `DailyDefenseState` without touching `combatLog` or
 * `victoryLootPool` — the game layer assigns log ids and may clear loot on victory.
 */
export function applyEncounterCombatRoundToDaily(
  prior: DailyDefenseState,
  stateDelta: EncounterCombatStateDelta,
): DailyDefenseState {
  return {
    ...prior,
    currentTurn: stateDelta.currentTurn,
    enemies: stateDelta.enemies,
    defenderLine: stateDelta.defenderLine,
    totalEnemyPoints: stateDelta.totalEnemyPoints,
    outcome: stateDelta.outcome,
    phase: stateDelta.phase,
    isCompleted: stateDelta.isCompleted,
    allySpirit: stateDelta.allySpirit,
    moraleShockTurnsRemaining: stateDelta.moraleShockTurnsRemaining,
  };
}
