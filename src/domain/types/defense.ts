import type {
  CombatLogEntry,
  DefenseParticipant,
  EnemyInstance,
} from './combat.ts';

export type MuralhaCardinal = 'norte' | 'sul' | 'leste' | 'oeste';

export interface SectionIntegrity {
  current: number;
  max: number;
  breached: boolean;
}

export interface MuralhaState {
  level: number;
  layers: number;
  sections: Record<MuralhaCardinal, SectionIntegrity>;
  lastAttackedSection?: MuralhaCardinal;
  /** YYYY-MM-DD — narrative / anti-spam for repairs. */
  lastRepairedDate?: string;
}

export interface DailyDefenseState {
  /** Calendar day for daily reset (local), YYYY-MM-DD. */
  date: string;
  /** Resolver position for combat simulation (independent of log mirroring). */
  currentTurn: number;
  isLocked: Record<string, boolean>;
  lockedAt: Record<string, number | null>;
  combatLog: CombatLogEntry[];
  enemies: EnemyInstance[];
  totalEnemyPoints: number;
  playerContribution: Record<string, number>;
  isCompleted: boolean;
  startHour: number;
  attackedSection: MuralhaCardinal;
  participants: DefenseParticipant[];
  /** Anchor for scaling (e.g. days since founding). */
  gameDayIndex: number;
}
