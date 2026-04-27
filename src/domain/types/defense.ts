import type { CoreAttributes } from './attributes.ts';
import type {
  CombatLogEntry,
  DefenseParticipant,
  DefenseTacticalBucket,
  EnemyInstance,
  MoveTemplateId,
} from './combat.ts';
import type { Item } from './items.ts';

export type NightlyDefensePhase = 'idle' | 'preparing' | 'fighting' | 'ended';

export type NightlyDefenseOutcome =
  | 'active'
  | 'victory'
  | 'breach'
  | 'prefeitura_siege'
  | 'loss';

export interface DefenderCombatState {
  /** Move template id -> turns before the move can be selected again. */
  cooldowns: Record<MoveTemplateId, number>;
  /** Runtime buff/status id -> turns remaining. */
  statuses: Record<string, number>;
}

/** Player defenders in the nightly fight (session HP; melee front line MVP). */
export interface DefenderLineEntry {
  characterId: string;
  name: string;
  currentHp: number;
  maxHp: number;
  retreated: boolean;
  /** Role on the abstract defense line (autoplay / strike bias). */
  tacticalBucket?: DefenseTacticalBucket;
  /**
   * When set (snapshot from character), defender outgoing strikes use the unified
   * strike pipeline (`resolveStrikeDamage`); when omitted, legacy melee resolve only.
   */
  coreAttributes?: CoreAttributes;
  /**
   * Deck for future autoplay on the line ({@link pickAutoplaySkill}); optional until wired.
   */
  skillIds?: MoveTemplateId[];
  /**
   * Runtime state for a single defense session. Optional so old saves and tests start
   * with an empty state.
   */
  combatState?: DefenderCombatState;
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
  participants: DefenseParticipant[];
  /** Anchor for scaling (e.g. days since founding). */
  gameDayIndex: number;
  /** Breach raid entry hex for this wave (axial key); march proceeds toward Centro. */
  targetHexId: string;
  phase: NightlyDefensePhase;
  outcome: NightlyDefenseOutcome;
  /** Snapshot per fight; filled when combat starts. */
  defenderLine: DefenderLineEntry[];
  /** Ally-side cohesion meter (combat rounds only). */
  allySpirit: number;
  /** While > 0, defender melee pressure is suppressed (morale shock). */
  moraleShockTurnsRemaining: number;
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
