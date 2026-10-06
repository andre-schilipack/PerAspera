import type { AlgoProgram } from '../ai/policy.ts';
import type { CoreAttributes } from '../../types/attributes.ts';
import type { BattleId, TeamId, TileId, UnitId, UnitRole } from './events.ts';

export interface UnitSpec {
  unitId: UnitId;
  teamId: TeamId;
  role: UnitRole;
  tileId: TileId;
  attributes: CoreAttributes;
  maxHp: number;
  hp?: number;
  maxMana: number;
  mana?: number;
  skillIds?: readonly string[];
  speed: number;
  /**
   * When set, this unit decides with AlgoCombat instead of autoplay.
   * Absent means the hands-off autoplay policy.
   */
  algoProgram?: AlgoProgram;
  /** Cannot step. Still acts (attack, cast, wait). */
  immobile?: boolean;
  /**
   * If this unit dies, its team loses immediately — even if other allies live.
   * Used for scenario anchors (Prefeitura).
   */
  vital?: boolean;
}

export interface BattleInput {
  battleId: BattleId;
  units: readonly UnitSpec[];
  maxTicks: number;
  /** Initial simulation clock (tick). Defaults to 0. */
  startTick?: number;
  obstacles?: ReadonlySet<TileId>;
  /** Skill template resolver (defaults to `getMoveTemplate`). */
  getSkillTemplate?: (id: string) => import('../../types/combat.ts').MoveTemplate | undefined;
  /** Default: `Math.random`. */
  randomSource?: () => number;

  /** Retreat triggers when hp/maxHp <= this fraction. Default 0.25. */
  retreatHpFraction?: number;
  /** Once in retreat zone, roll per action to retreat. Default 0.35. */
  retreatChance?: number;
  /** Permadeath roll when a unit dies (and did not retreat). Default 0.05. */
  permadeathChance?: number;
}

export interface UnitState {
  unitId: UnitId;
  teamId: TeamId;
  role: UnitRole;
  tileId: TileId;
  attributes: CoreAttributes;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  skillIds: readonly string[];
  cooldowns: Record<string, number>;
  statuses: Record<string, number>;
  speed: number;
  alive: boolean;
  retreated: boolean;
  nextActAt: number;
  immobile: boolean;
  vital: boolean;
  /** Copied from the spec. Absent means autoplay. */
  algoProgram?: AlgoProgram;
}

export interface BattleState {
  tick: number;
  unitsById: Record<UnitId, UnitState>;
}

export interface BattleStateSummary {
  winningTeamId: TeamId | null;
  ticksElapsed: number;
  livingUnitsByTeam: Record<TeamId, number>;
}

export interface BattleStatsSummary {
  byUnit: Record<
    UnitId,
    {
      damageDealt: number;
      damageTaken: number;
      kills: number;
    }
  >;
}

export interface BattleResult {
  schemaVersion: 1;
  battleId: BattleId;
  canonicalEvents: readonly import('./events.ts').CanonicalEvent[];
  finalState: BattleStateSummary;
  summary: BattleStatsSummary;
}

