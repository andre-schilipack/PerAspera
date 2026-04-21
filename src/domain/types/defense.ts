import type {
  CombatLogEntry,
  DefenseParticipant,
  EnemyInstance,
} from './combat.ts';
import type { Item } from './items.ts';

export type WallCardinal = 'north' | 'south' | 'east' | 'west';

export interface SectionIntegrity {
  current: number;
  max: number;
  breached: boolean;
}

export interface WallState {
  level: number;
  layers: number;
  sections: Record<WallCardinal, SectionIntegrity>;
  lastAttackedSection?: WallCardinal;
  /** YYYY-MM-DD — narrative / anti-spam for repairs. */
  lastRepairedDate?: string;
}

export type NightlyDefensePhase = 'idle' | 'preparing' | 'fighting' | 'ended';

export type NightlyDefenseOutcome =
  | 'active'
  | 'victory'
  | 'breach'
  | 'prefeitura_siege'
  | 'loss';

/** Player defenders in the nightly fight (session HP; melee front line MVP). */
export interface DefenderLineEntry {
  characterId: string;
  name: string;
  currentHp: number;
  maxHp: number;
  retreated: boolean;
}

export interface DailyDefenseState {
  /** Calendar day for daily reset (local), YYYY-MM-DD. */
  date: string;
  /** Resolver position for combat simulation (independent of log mirroring). */
  currentTurn: number;
  isLocked: Record<string, boolean>;
  lockedAt: Record<string, number | null>;
  /** Which `date` this character enlisted for (YYYY-MM-DD). */
  enlistedForDate: Record<string, string>;
  combatLog: CombatLogEntry[];
  enemies: EnemyInstance[];
  totalEnemyPoints: number;
  playerContribution: Record<string, number>;
  isCompleted: boolean;
  startHour: number;
  attackedSection: WallCardinal;
  participants: DefenseParticipant[];
  /** Anchor for scaling (e.g. days since founding). */
  gameDayIndex: number;
  /** Breach raid entry hex for this wave (axial key); march proceeds toward Centro. */
  targetHexId: string;
  phase: NightlyDefensePhase;
  outcome: NightlyDefenseOutcome;
  /** Snapshot per fight; filled when combat starts. */
  defenderLine: DefenderLineEntry[];
  /**
   * Rolled when the wave is seeded; split randomly among `defenderLine` on victory.
   */
  victoryLootPool: Item[];
}

/** Post-battle summary modal (not persisted). */
export interface DefenseVictoryParticipantSummary {
  characterId: string;
  name: string;
  scoreDelta: number;
  reputationDelta: number;
  credsDelta: number;
  items: Item[];
}

export type DefenseEndScreenState =
  | {
      kind: 'victory';
      participants: DefenseVictoryParticipantSummary[];
    }
  | {
      kind: 'defeat';
      variant: 'breach';
    };

/** One simulated calendar night after offline catch-up (bootstrap). */
export interface DefenseCatchUpNightRow {
  date: string;
  gameDayIndex: number;
  outcome: NightlyDefenseOutcome;
}
