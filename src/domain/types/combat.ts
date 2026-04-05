export type EnemyKind = 'robotic' | 'organic' | 'hybrid';

export interface Enemy {
  id: string;
  name: string;
  type: EnemyKind;
  basePoints: number;
  health: number;
  moves: string[];
}

export interface EnemyInstance {
  enemyId: string;
  currentHealth: number;
  buffs: Record<string, number>;
}

export type MoveTargetScope = 'single' | 'multi' | 'all';

export type MoveDamageKind = 'physical' | 'neon' | 'hack' | 'organic';

export interface Move {
  id: string;
  name: string;
  description: string;
  damage: number;
  targets: MoveTargetScope;
  cost: number;
  type: MoveDamageKind;
}

export type CombatLogActor =
  | 'player'
  | 'guarda'
  | 'muralha'
  | 'enemy'
  | 'system';

export interface CombatLogEntry {
  /** Monotonic counter from meta `nextIds`, not a UUID. */
  id: number;
  turn: number;
  timestamp: number;
  text: string;
  type: CombatLogActor;
}

export type DefenseSide = 'norte' | 'sul' | 'leste' | 'oeste' | 'centro';

export type DefenseParticipantKind = 'player' | 'guarda_muralha';

export interface DefenseParticipant {
  id: string;
  type: DefenseParticipantKind;
  name: string;
  side: DefenseSide;
  currentHealth: number;
  maxHealth: number;
  availableMoves: string[];
}
