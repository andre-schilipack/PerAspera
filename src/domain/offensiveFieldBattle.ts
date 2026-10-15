import { simulateBattle } from './combat/index.ts';
import type { CanonicalEvent } from './combat/core/events.ts';
import type { UnitRole } from './combat/core/events.ts';
import { playback } from './combat/io/playback.ts';
import { groupCanonicalEventsByTick } from './combat/io/groupByTick.ts';
import { speedFromAgility } from './streetSkirmish.ts';
import {
  CITY_THREAT_REDUCTION_ON_FULL_NEST,
  NEST_COVER_HP_BONUS,
  NEST_STRUCTURE_MAX_HP,
  OFFENSIVE_ATTACKER_RETREAT_CHANCE,
  OFFENSIVE_FIELD_MAX_TICKS,
  OFFENSIVE_NEST_STRUCTURE_UNIT_ID,
  OFFENSIVE_RETREAT_HP_FRACTION,
  OFFENSIVE_TEAM_ATTACKERS,
  OFFENSIVE_TEAM_NEST,
} from './constants.ts';
import {
  composeWaveFromBudget,
  reduceCityThreatFromNestDamage,
  waveBudgetFromCityThreat,
} from './enemyThreat.ts';
import {
  findRobotNestFeature,
  normalizeRobotNestFeature,
  upsertRobotNestFeatureHp,
} from './nestIntel.ts';
import { enemyBucketForSpawnIndex } from './defenseTactics.ts';
import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import type { CoreAttributes } from './types/attributes.ts';
import type { CombatLogActor, CombatLogEntry, DefenseTacticalBucket } from './types/combat.ts';
import type { HexMap } from './types/map.ts';
import type { AlgoProgram } from './combat/ai/policy.ts';
import type { BattleResult } from './combat/core/types.ts';
import type { OffensiveBattleOutcome } from './types/offensive.ts';

export type { OffensiveBattleOutcome };

export interface OffensiveAttackerSpec {
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

export interface ResolveOffensiveNestBattleParams {
  battleId: string;
  hexMap: HexMap;
  nestHexId: string;
  attackers: readonly OffensiveAttackerSpec[];
  cityThreatLevel: number;
  rng?: () => number;
  nowMs?: number;
}

export interface OffensiveAttackerResult {
  characterId: string;
  currentHp: number;
  maxHp: number;
  retreated: boolean;
}

export interface ResolveOffensiveNestBattleResult {
  outcome: OffensiveBattleOutcome;
  hexMap: HexMap;
  nestHpBefore: number;
  nestHpAfter: number;
  nestHpLost: number;
  cityThreatBefore: number;
  cityThreatAfter: number;
  threatReduced: number;
  attackers: OffensiveAttackerResult[];
  combatLog: Omit<CombatLogEntry, 'id'>[];
  /** Present when `simulateBattle` ran. The archive stores this reel. */
  battleResult?: BattleResult;
  unitNames?: Record<string, string>;
}

function roleFromBucket(bucket: DefenseTacticalBucket | undefined): UnitRole {
  if (bucket === 'ranged') return 'ranged';
  if (bucket === 'support') return 'support';
  return 'frontline';
}

function scaleCoverHp(hp: number, maxHp: number, bonus: number): { hp: number; maxHp: number } {
  if (bonus <= 0) {
    const max = Math.max(1, Math.floor(maxHp));
    return { maxHp: max, hp: Math.max(0, Math.min(max, Math.floor(hp))) };
  }
  const scaledMax = Math.max(1, Math.floor(maxHp * (1 + bonus)));
  const scaledHp = Math.max(0, Math.min(scaledMax, Math.floor(hp * (1 + bonus))));
  return { hp: scaledHp, maxHp: scaledMax };
}

function labelFor(unitId: string, names: ReadonlyMap<string, string>): string {
  return names.get(unitId) ?? unitId;
}

function actorFor(
  event: CanonicalEvent,
  attackerIds: ReadonlySet<string>,
): CombatLogActor {
  const unitId =
    event.type === 'damage_dealt' ||
    event.type === 'healed' ||
    event.type === 'status_applied'
      ? event.sourceId
      : 'unitId' in event
        ? event.unitId
        : undefined;
  if (!unitId) return 'system';
  if (attackerIds.has(unitId)) return 'player';
  if (unitId === OFFENSIVE_NEST_STRUCTURE_UNIT_ID) return 'wall';
  if (unitId.startsWith('nest_drone:')) return 'enemy';
  return 'system';
}

function eventToText(
  event: CanonicalEvent,
  names: ReadonlyMap<string, string>,
): string | null {
  const L = (id: string) => labelFor(id, names);
  switch (event.type) {
    case 'tick_advanced':
    case 'unit_spawned':
      return null;
    case 'unit_acted':
      if (event.action === 'wait') return null;
      if (event.action === 'retreat') return `${L(event.unitId)} tries to break off.`;
      if (event.action === 'move') return `${L(event.unitId)} repositions.`;
      if (event.action === 'attack') return `${L(event.unitId)} strikes.`;
      if (event.action === 'cast') return `${L(event.unitId)} fires.`;
      return null;
    case 'unit_moved':
      return null;
    case 'damage_dealt':
      if (event.amount <= 0) return null;
      return `${L(event.sourceId)} hits ${L(event.targetId)} for ${String(event.amount)}.`;
    case 'unit_died':
      return `${L(event.unitId)} goes down.`;
    case 'unit_retreated':
      return `${L(event.unitId)} retreats.`;
    case 'battle_ended':
      return null;
    default:
      return null;
  }
}

/**
 * One-shot offensive sortie against the robot nest.
 * Nest cover (+30% HP) applies to drones while the structure still had HP at start.
 * Nest is vital+immobile. All-attacker retreat → interrupted.
 */
export function resolveOffensiveNestBattle(
  params: ResolveOffensiveNestBattleParams,
): ResolveOffensiveNestBattleResult {
  const rng = params.rng ?? Math.random;
  const nowMs = params.nowMs ?? Date.now();
  const nestHexId = params.nestHexId;
  const tile = params.hexMap.hexes[nestHexId];
  if (!tile) {
    throw new Error(`resolveOffensiveNestBattle: missing nest hex ${nestHexId}`);
  }

  const rawNest = findRobotNestFeature(tile.features);
  const nestFeature = rawNest
    ? normalizeRobotNestFeature(rawNest)
    : {
        type: 'robot_nest' as const,
        currentHp: NEST_STRUCTURE_MAX_HP,
        maxHp: NEST_STRUCTURE_MAX_HP,
      };
  const nestHpBefore = nestFeature.currentHp;
  const nestMaxHp = nestFeature.maxHp;
  const coverBonus = nestHpBefore > 0 ? NEST_COVER_HP_BONUS : 0;

  const names = new Map<string, string>();
  const attackerIds = new Set<string>();
  const baseMaxById = new Map<string, number>();

  const attackerUnits = params.attackers
    .filter((a) => a.currentHp > 0)
    .map((a) => {
      attackerIds.add(a.characterId);
      names.set(a.characterId, a.name);
      baseMaxById.set(a.characterId, Math.max(1, a.maxHp));
      const attrs = a.coreAttributes ?? DEFAULT_CORE_ATTRIBUTES;
      const skills =
        a.skillIds && a.skillIds.length > 0 ? [...a.skillIds] : ['basic_attack'];
      const role = a.combatRole ?? roleFromBucket(a.tacticalBucket);
      return {
        unitId: a.characterId,
        teamId: OFFENSIVE_TEAM_ATTACKERS,
        role,
        tileId: '',
        attributes: attrs,
        maxHp: Math.max(1, a.maxHp),
        hp: Math.max(1, Math.min(a.maxHp, a.currentHp)),
        maxMana: 0,
        mana: 0,
        skillIds: skills,
        speed: speedFromAgility(attrs.agility),
        algoProgram: a.algoProgram,
      };
    });

  if (attackerUnits.length === 0) {
    return {
      outcome: 'defeat',
      hexMap: params.hexMap,
      nestHpBefore,
      nestHpAfter: nestHpBefore,
      nestHpLost: 0,
      cityThreatBefore: params.cityThreatLevel,
      cityThreatAfter: params.cityThreatLevel,
      threatReduced: 0,
      attackers: params.attackers.map((a) => ({
        characterId: a.characterId,
        currentHp: a.currentHp,
        maxHp: a.maxHp,
        retreated: false,
      })),
      combatLog: [
        {
          turn: 0,
          timestamp: nowMs,
          text: 'No able bodies for the sortie.',
          type: 'system',
          highlight: true,
        },
      ],
    };
  }

  names.set(OFFENSIVE_NEST_STRUCTURE_UNIT_ID, 'Robot nest');

  const garrisonBudget = Math.max(
    2,
    waveBudgetFromCityThreat(params.cityThreatLevel),
  );
  const garrison = composeWaveFromBudget(garrisonBudget, rng);
  const droneUnits = garrison.map((enemy, index) => {
    const unitId = `nest_drone:${String(index)}`;
    names.set(unitId, enemy.enemyId);
    const scaled = scaleCoverHp(
      enemy.currentHealth,
      enemy.maxHealth,
      coverBonus,
    );
    return {
      unitId,
      teamId: OFFENSIVE_TEAM_NEST,
      role: roleFromBucket(enemy.tacticalBucket ?? enemyBucketForSpawnIndex(index)),
      tileId: '',
      attributes: DEFAULT_CORE_ATTRIBUTES,
      maxHp: scaled.maxHp,
      hp: Math.max(0, scaled.hp),
      maxMana: 0,
      mana: 0,
      skillIds: ['basic_attack'],
      speed: speedFromAgility(DEFAULT_CORE_ATTRIBUTES.agility),
    };
  });

  const nestUnit = {
    unitId: OFFENSIVE_NEST_STRUCTURE_UNIT_ID,
    teamId: OFFENSIVE_TEAM_NEST,
    role: 'frontline' as const,
    tileId: '',
    attributes: DEFAULT_CORE_ATTRIBUTES,
    maxHp: nestMaxHp,
    hp: Math.max(0, nestHpBefore),
    maxMana: 0,
    mana: 0,
    skillIds: [] as string[],
    speed: 0.1,
    immobile: true,
    vital: true,
  };

  const result = simulateBattle({
    battleId: params.battleId,
    maxTicks: OFFENSIVE_FIELD_MAX_TICKS,
    randomSource: rng,
    retreatHpFraction: OFFENSIVE_RETREAT_HP_FRACTION,
    retreatChance: OFFENSIVE_ATTACKER_RETREAT_CHANCE,
    permadeathChance: 0,
    units: [...attackerUnits, nestUnit, ...droneUnits],
  });

  const pb = playback(result.canonicalEvents);
  const nestPb = pb.unitsById[OFFENSIVE_NEST_STRUCTURE_UNIT_ID];
  const nestHpAfter = nestPb && nestPb.alive ? Math.max(0, nestPb.hp) : 0;
  const nestHpLost = Math.max(0, nestHpBefore - nestHpAfter);

  const attackerResults: OffensiveAttackerResult[] = params.attackers.map((a) => {
    const unit = pb.unitsById[a.characterId];
    if (!unit) {
      return {
        characterId: a.characterId,
        currentHp: a.currentHp,
        maxHp: a.maxHp,
        retreated: false,
      };
    }
    const baseMax = baseMaxById.get(a.characterId) ?? a.maxHp;
    const currentHp = Math.max(0, Math.min(baseMax, Math.round(unit.hp)));
    return {
      characterId: a.characterId,
      currentHp,
      maxHp: baseMax,
      retreated: unit.retreated === true,
    };
  });

  const fielded = attackerResults.filter((a) =>
    attackerIds.has(a.characterId),
  );
  const anyStillFighting = fielded.some(
    (a) => a.currentHp > 0 && !a.retreated,
  );
  const anyRetreated = fielded.some((a) => a.retreated);
  const nestDestroyed = nestHpAfter <= 0;
  const attackersWon =
    result.finalState.winningTeamId === OFFENSIVE_TEAM_ATTACKERS;

  let outcome: OffensiveBattleOutcome;
  if (nestDestroyed || attackersWon) {
    outcome = 'victory';
  } else if (!anyStillFighting && anyRetreated) {
    outcome = 'interrupted';
  } else {
    outcome = 'defeat';
  }

  const { nextThreat, threatReduced } = reduceCityThreatFromNestDamage({
    cityThreatLevel: params.cityThreatLevel,
    nestHpLost,
    nestMaxHp,
    fullNestThreatReduction: CITY_THREAT_REDUCTION_ON_FULL_NEST,
  });

  // Victory: nest rebuilds for the next recurring sortie (pressure already cut).
  const nestHpPersisted =
    outcome === 'victory' ? nestMaxHp : nestHpAfter;
  const nextMap: HexMap = {
    ...params.hexMap,
    hexes: {
      ...params.hexMap.hexes,
      [nestHexId]: upsertRobotNestFeatureHp(tile, nestHpPersisted, nestMaxHp),
    },
  };

  const lines: Omit<CombatLogEntry, 'id'>[] = [
    {
      turn: 0,
      timestamp: nowMs,
      text: `Sortie on the robot nest at ${nestHexId}.`,
      type: 'system',
    },
  ];

  for (const group of groupCanonicalEventsByTick(result.canonicalEvents)) {
    for (const event of group.events) {
      const text = eventToText(event, names);
      if (!text) continue;
      lines.push({
        turn: group.tick,
        timestamp: nowMs,
        text,
        type: actorFor(event, attackerIds),
      });
    }
  }

  const endText =
    outcome === 'victory'
      ? 'Nest core offline — sortie success.'
      : outcome === 'interrupted'
        ? 'All attackers fell back — sortie interrupted. Force returns to the city.'
        : 'Attack force broken — sortie failed.';
  lines.push({
    turn: result.finalState.ticksElapsed,
    timestamp: nowMs,
    text: endText,
    type: 'system',
    highlight: true,
  });
  if (threatReduced > 0.05) {
    lines.push({
      turn: result.finalState.ticksElapsed,
      timestamp: nowMs,
      text: `Nest damage cuts city threat by ${threatReduced.toFixed(1)} (now ${nextThreat.toFixed(1)}).`,
      type: 'system',
      highlight: true,
    });
  }

  return {
    outcome,
    hexMap: nextMap,
    nestHpBefore,
    nestHpAfter: nestHpPersisted,
    nestHpLost,
    cityThreatBefore: params.cityThreatLevel,
    cityThreatAfter: nextThreat,
    threatReduced,
    attackers: attackerResults,
    combatLog: lines,
    battleResult: result,
    unitNames: Object.fromEntries(names),
  };
}
