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
  speed: number;
}

export interface BattleInput {
  battleId: BattleId;
  units: readonly UnitSpec[];
  maxTicks: number;
  /** Default: `Math.random`. */
  randomSource?: () => number;
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
  speed: number;
  alive: boolean;
  retreated: boolean;
  nextActAt: number;
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

