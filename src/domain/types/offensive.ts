import type { CombatLogEntry } from './combat.ts';

export type OffensiveBattleOutcome = 'victory' | 'defeat' | 'interrupted';

/** Volatile playback session after an offensive sortie resolves. */
export interface OffensiveSortieSession {
  contractId: string;
  nestHexId: string;
  outcome: OffensiveBattleOutcome;
  combatLog: CombatLogEntry[];
  threatReduced: number;
  cityThreatAfter: number;
  nestHpAfter: number;
}
