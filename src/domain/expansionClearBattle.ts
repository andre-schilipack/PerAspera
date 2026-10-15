import { MOVE_ID_GUARD_DISPARO } from '../content/catalogs/moves.ts';
import { simulateBattle } from './combat/index.ts';
import type { UnitRole } from './combat/core/events.ts';
import type { BattleResult } from './combat/core/types.ts';
import { playback } from './combat/io/playback.ts';
import { speedFromAgility } from './streetSkirmish.ts';
import {
  DEFENSE_GUARD_MAX_HP,
  EXPANSION_CAPTAIN_LABEL,
  EXPANSION_CAPTAIN_MAX_HP,
  EXPANSION_CAPTAIN_UNIT_ID,
  EXPANSION_CLEAR_BASE_DRONES,
  EXPANSION_FIELD_MAX_TICKS,
  EXPANSION_GUARD_LABEL,
  EXPANSION_GUARD_UNIT_IDS,
  EXPANSION_RETREAT_CHANCE,
  EXPANSION_RETREAT_HP_FRACTION,
  EXPANSION_TEAM_CITY,
  EXPANSION_TEAM_DRONES,
} from './constants.ts';
import { enemyBucketForSpawnIndex } from './defenseTactics.ts';
import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import type { CoreAttributes } from './types/attributes.ts';
import type { AlgoProgram } from './combat/ai/policy.ts';
import type { DefenseTacticalBucket } from './types/combat.ts';

export type ExpansionClearOutcome = 'victory' | 'defeat' | 'interrupted';

const DRONE_BASE_HP = 22;

export function expansionDroneCount(distanceFromCenter: number): number {
  const distance = Math.max(0, Math.floor(distanceFromCenter));
  return EXPANSION_CLEAR_BASE_DRONES + distance;
}

export interface ExpansionFighterSpec {
  characterId: string;
  name: string;
  currentHp: number;
  maxHp: number;
  coreAttributes?: CoreAttributes;
  skillIds?: readonly string[];
  combatRole?: UnitRole;
  algoProgram?: AlgoProgram;
  tacticalBucket?: DefenseTacticalBucket;
}

export interface ExpansionFighterResult {
  characterId: string;
  currentHp: number;
  maxHp: number;
  retreated: boolean;
}

export interface ResolveExpansionClearBattleParams {
  battleId: string;
  /** Axial distance from Centro. Enemy count is 4 + this value. */
  distanceFromCenter: number;
  fighters: readonly ExpansionFighterSpec[];
  rng?: () => number;
  nowMs?: number;
}

export interface ResolveExpansionClearBattleResult {
  outcome: ExpansionClearOutcome;
  fighters: ExpansionFighterResult[];
  battleResult: BattleResult;
  unitNames: Record<string, string>;
}

function roleFromBucket(bucket: DefenseTacticalBucket | undefined): UnitRole {
  if (bucket === 'ranged') return 'ranged';
  if (bucket === 'support') return 'support';
  return 'frontline';
}

function droneUnitId(index: number): string {
  return `expansion_drone:${String(index)}`;
}

/**
 * One-shot squad clear of a locked hex.
 * Allies: enlisted characters (HP > 0), one mobile captain, two mobile guards.
 * Hostiles: 4 + distance drone scouts. Does not touch the hex map.
 */
export function resolveExpansionClearBattle(
  params: ResolveExpansionClearBattleParams,
): ResolveExpansionClearBattleResult {
  const rng = params.rng ?? Math.random;
  const names = new Map<string, string>();

  const characterUnits = params.fighters
    .filter((f) => f.currentHp > 0)
    .map((f) => {
      names.set(f.characterId, f.name);
      const attrs = f.coreAttributes ?? DEFAULT_CORE_ATTRIBUTES;
      const skills =
        f.skillIds && f.skillIds.length > 0 ? [...f.skillIds] : ['basic_attack'];
      const maxHp = Math.max(1, f.maxHp);
      return {
        unitId: f.characterId,
        teamId: EXPANSION_TEAM_CITY,
        role: f.combatRole ?? roleFromBucket(f.tacticalBucket),
        tileId: '',
        attributes: attrs,
        maxHp,
        hp: Math.max(1, Math.min(maxHp, f.currentHp)),
        maxMana: 0,
        mana: 0,
        skillIds: skills,
        speed: speedFromAgility(attrs.agility),
        algoProgram: f.algoProgram,
      };
    });

  const captainAttrs: CoreAttributes = {
    ...DEFAULT_CORE_ATTRIBUTES,
    strength: 4,
    agility: 3,
  };
  names.set(EXPANSION_CAPTAIN_UNIT_ID, EXPANSION_CAPTAIN_LABEL);
  const captainUnit = {
    unitId: EXPANSION_CAPTAIN_UNIT_ID,
    teamId: EXPANSION_TEAM_CITY,
    role: 'frontline' as const,
    tileId: '',
    attributes: captainAttrs,
    maxHp: EXPANSION_CAPTAIN_MAX_HP,
    hp: EXPANSION_CAPTAIN_MAX_HP,
    maxMana: 0,
    mana: 0,
    skillIds: ['basic_attack'],
    speed: speedFromAgility(captainAttrs.agility),
  };

  const guardAttrs: CoreAttributes = {
    ...DEFAULT_CORE_ATTRIBUTES,
    strength: 2,
    agility: 2,
  };
  const guardUnits = EXPANSION_GUARD_UNIT_IDS.map((id) => {
    names.set(id, EXPANSION_GUARD_LABEL);
    return {
      unitId: id,
      teamId: EXPANSION_TEAM_CITY,
      role: 'ranged' as const,
      tileId: '',
      attributes: guardAttrs,
      maxHp: DEFENSE_GUARD_MAX_HP,
      hp: DEFENSE_GUARD_MAX_HP,
      maxMana: 0,
      mana: 0,
      skillIds: [MOVE_ID_GUARD_DISPARO],
      speed: speedFromAgility(guardAttrs.agility),
    };
  });

  const droneCount = expansionDroneCount(params.distanceFromCenter);
  const droneUnits = Array.from({ length: droneCount }, (_, index) => {
    const unitId = droneUnitId(index);
    const hp = DRONE_BASE_HP + Math.floor(rng() * 10);
    names.set(unitId, `Drone ${String(index + 1)}`);
    const bucket = enemyBucketForSpawnIndex(index);
    return {
      unitId,
      teamId: EXPANSION_TEAM_DRONES,
      role: roleFromBucket(bucket),
      tileId: '',
      attributes: DEFAULT_CORE_ATTRIBUTES,
      maxHp: hp,
      hp,
      maxMana: 0,
      mana: 0,
      skillIds: ['basic_attack'],
      speed: speedFromAgility(DEFAULT_CORE_ATTRIBUTES.agility),
    };
  });

  const battleResult = simulateBattle({
    battleId: params.battleId,
    maxTicks: EXPANSION_FIELD_MAX_TICKS,
    randomSource: rng,
    retreatHpFraction: EXPANSION_RETREAT_HP_FRACTION,
    retreatChance: EXPANSION_RETREAT_CHANCE,
    permadeathChance: 0,
    units: [...characterUnits, captainUnit, ...guardUnits, ...droneUnits],
  });

  const pb = playback(battleResult.canonicalEvents);
  const fighters: ExpansionFighterResult[] = params.fighters.map((f) => {
    const unit = pb.unitsById[f.characterId];
    if (!unit) {
      return {
        characterId: f.characterId,
        currentHp: f.currentHp,
        maxHp: f.maxHp,
        retreated: false,
      };
    }
    const maxHp = Math.max(1, f.maxHp);
    return {
      characterId: f.characterId,
      currentHp: Math.max(0, Math.min(maxHp, Math.round(unit.hp))),
      maxHp,
      retreated: unit.retreated === true,
    };
  });

  const cityUnits = Object.values(pb.unitsById).filter(
    (unit) => unit.teamId === EXPANSION_TEAM_CITY,
  );
  const anyStillFighting = cityUnits.some(
    (unit) => unit.alive && !unit.retreated && unit.hp > 0,
  );
  const anyRetreated = cityUnits.some((unit) => unit.retreated);
  const cityWon = battleResult.finalState.winningTeamId === EXPANSION_TEAM_CITY;

  let outcome: ExpansionClearOutcome;
  if (cityWon) outcome = 'victory';
  else if (!anyStillFighting && anyRetreated) outcome = 'interrupted';
  else outcome = 'defeat';

  return {
    outcome,
    fighters,
    battleResult,
    unitNames: Object.fromEntries(names),
  };
}
