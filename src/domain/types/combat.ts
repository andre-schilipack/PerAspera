import type { CoreAttributeKey } from './attributes.ts';

export type EnemyKind = 'robotic' | 'organic' | 'hybrid';

export interface Enemy {
  id: string;
  name: string;
  type: EnemyKind;
  basePoints: number;
  health: number;
  moves: string[];
}

/** Formation bucket for many-vs-many defense (aggregated targeting). */
export type DefenseTacticalBucket = 'front' | 'ranged' | 'support';

export interface EnemyInstance {
  enemyId: string;
  currentHealth: number;
  /** Spawn max HP (used for HP fractions and UI). Preserved when applying damage. */
  maxHealth: number;
  /** Hostile role for strike targeting and defensive picks. */
  tacticalBucket?: DefenseTacticalBucket;
  buffs: Record<string, number>;
}

export type MoveTargetScope = 'single' | 'multi' | 'all';

export type MoveDamageKind =
  | 'physical'
  | 'fire'
  | 'chemical'
  | 'electric'
  | 'energy'
  | 'ice'
  | 'hack';

/** Stable id for {@link MoveTemplate} rows (catalog keys). */
export type MoveTemplateId = string;

export type MoveTag =
  | 'burst'
  | 'buff'
  | 'debuff'
  | 'cleanse'
  | 'execute'
  | 'aoe'
  | 'single'
  | 'control'
  | 'hack'
  | 'ranged';

export type MovePower =
  | { mode: 'flat'; basePower: number }
  | {
      mode: 'scaleAttribute';
      attribute: CoreAttributeKey;
      coefficient: number;
      base?: number;
    };

/**
 * Authoritative definition for a combat move (catalog row).
 * Runtime combat uses templates + participant state (cooldowns, buffs).
 */
export interface MoveTemplate {
  id: MoveTemplateId;
  name: string;
  description: string;
  damageKind: MoveDamageKind;
  targets: MoveTargetScope;
  /** Future: stamina or other combat-resource cost per use. */
  cost: number;
  power: MovePower;
  tags: MoveTag[];
}

export type CombatLogActor =
  | 'player'
  | 'guarda'
  | 'wall'
  | 'enemy'
  | 'system';

/** Narrative beat for autoplay pacing (race-like arc). */
export type CombatBeatPhase = 'approach' | 'contact' | 'endgame';

export interface CombatLogEntry {
  /** Monotonic counter from meta `nextIds`, not a UUID. */
  id: number;
  turn: number;
  timestamp: number;
  text: string;
  type: CombatLogActor;
  /** Optional: which tactical beat this line belongs to (UI / future animation hooks). */
  combatBeatPhase?: CombatBeatPhase;
  /** Optional: decisive moment for emphasis in the log UI. */
  highlight?: boolean;
}

export type DefenseSide = 'norte' | 'sul' | 'leste' | 'oeste' | 'centro';

export type DefenseParticipantKind = 'player' | 'wall_guard';

export interface DefenseParticipant {
  id: string;
  type: DefenseParticipantKind;
  name: string;
  side: DefenseSide;
  currentHealth: number;
  maxHealth: number;
  /** Move template ids equipped for autoplay (see {@link CombatLoadout}). */
  skillIds: string[];
}
