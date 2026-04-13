import type {
  CombatLogEntry,
  DefenseParticipant,
  EnemyInstance,
} from './combat.ts';

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
  phase: NightlyDefensePhase;
  outcome: NightlyDefenseOutcome;
  /** Snapshot per fight; filled when combat starts. */
  defenderLine: DefenderLineEntry[];
}
