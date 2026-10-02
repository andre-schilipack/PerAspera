import {
  MOVE_ID_GUARD_DISPARO,
  MOVE_ID_TOWER_RAJADA,
} from '../content/catalogs/moves.ts';
import { simulateBattle } from './combat/index.ts';
import type { CanonicalEvent } from './combat/core/events.ts';
import type { UnitRole } from './combat/core/events.ts';
import { playback } from './combat/io/playback.ts';
import { groupCanonicalEventsByTick } from './combat/io/groupByTick.ts';
import { speedFromAgility } from './streetSkirmish.ts';
import {
  CENTER_HEX_ID,
  DEFENSE_CITY_HALL_UNIT_ID,
  DEFENSE_GUARD_MAX_HP,
  DEFENSE_NPC_GUARD_IDS,
  DEFENSE_NPC_TOWER_ID,
  DEFENSE_NPC_TOWER_LABEL,
  DEFENSE_RETREAT_HP_FRACTION,
  DEFENSE_TEAM_DEFENDERS,
  DEFENSE_TEAM_HOSTILES,
  DEFENSE_TOWER_MAX_HP,
  NIGHTLY_FIELD_MAX_TICKS,
  NIGHTLY_WALL_COVER_HP_BONUS,
  PREFECTURE_STRUCTURE_MAX_HP,
} from './constants.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import {
  findCityHallFeature,
  findWallFeature,
  patchHexInMap,
  setCityHallFeatureHp,
  upsertWallFeatureHp,
} from './encounterCombatWall.ts';
import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import type { CoreAttributes } from './types/attributes.ts';
import type { CombatLogActor, CombatLogEntry, DefenseTacticalBucket, EnemyInstance } from './types/combat.ts';
import type { DailyDefenseState, DefenderLineEntry, NightlyDefenseOutcome } from './types/defense.ts';
import type { HexMap } from './types/map.ts';
import type { MassCombatWallSnapshot } from './types/massCombat.ts';

export type DefenseTheater = 'wall' | 'siege';

const HOSTILE_UNIT_PREFIX = 'hostile:';

export interface ResolveDefenseFieldBattleResult {
  nextDaily: DailyDefenseState;
  wallResult: MassCombatWallSnapshot;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
  hexMap?: HexMap;
}

function roleFromBucket(bucket: DefenseTacticalBucket | undefined): UnitRole {
  if (bucket === 'ranged') return 'ranged';
  if (bucket === 'support') return 'support';
  return 'frontline';
}

function hostileUnitId(index: number): string {
  return `${HOSTILE_UNIT_PREFIX}${String(index)}`;
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

function unscaleCoverHp(simHp: number, simMax: number, baseMax: number): number {
  if (simHp <= 0 || simMax <= 0) return 0;
  const ratio = simHp / simMax;
  return Math.min(baseMax, Math.max(0, Math.round(ratio * baseMax)));
}

function zeroWall(hexMap: HexMap, hexId: string): HexMap {
  return patchHexInMap(hexMap, hexId, (tile) => {
    const wall = findWallFeature(tile.features);
    if (!wall) return tile;
    return upsertWallFeatureHp(tile, 0, wall.maxHp);
  });
}

function labelFor(
  unitId: string,
  names: ReadonlyMap<string, string>,
): string {
  return names.get(unitId) ?? unitId;
}

function actorFor(
  event: CanonicalEvent,
  playerIds: ReadonlySet<string>,
): CombatLogActor {
  const unitId =
    event.type === 'damage_dealt' || event.type === 'healed' || event.type === 'status_applied'
      ? event.sourceId
      : 'unitId' in event
        ? event.unitId
        : undefined;
  if (!unitId) return 'system';
  if (unitId.startsWith(HOSTILE_UNIT_PREFIX)) return 'enemy';
  if (playerIds.has(unitId)) return 'player';
  if (unitId === DEFENSE_NPC_TOWER_ID || unitId === DEFENSE_CITY_HALL_UNIT_ID) return 'wall';
  if ((DEFENSE_NPC_GUARD_IDS as readonly string[]).includes(unitId)) return 'guarda';
  return 'system';
}

function eventToText(
  event: CanonicalEvent,
  names: ReadonlyMap<string, string>,
  theater: DefenseTheater,
): string | null {
  const L = (id: string) => labelFor(id, names);
  switch (event.type) {
    case 'tick_advanced':
    case 'unit_spawned':
      return null;
    case 'unit_moved':
      return `${L(event.unitId)} closes in.`;
    case 'unit_acted':
      if (event.action === 'attack') {
        return `${L(event.unitId)} strikes${event.targetId ? ` at ${L(event.targetId)}` : ''}.`;
      }
      if (event.action === 'cast') {
        return `${L(event.unitId)} uses ${event.skillId ?? 'a skill'}.`;
      }
      if (event.action === 'move') return null;
      if (event.action === 'wait') return `${L(event.unitId)} holds.`;
      if (event.action === 'retreat') return `${L(event.unitId)} tries to break off.`;
      return `${L(event.unitId)} acts.`;
    case 'damage_dealt': {
      if (event.flags.dodged) return `${L(event.targetId)} dodges ${L(event.sourceId)}.`;
      const blocked = event.flags.blocked ? ' (blocked)' : '';
      return `${L(event.sourceId)} hits ${L(event.targetId)} for ${String(event.amount)}${blocked}.`;
    }
    case 'healed':
      return `${L(event.sourceId)} heals ${L(event.targetId)} for ${String(event.amount)}.`;
    case 'status_applied':
      return `${L(event.targetId)} gains ${event.statusId}.`;
    case 'unit_retreated':
      return `${L(event.unitId)} retreats.`;
    case 'unit_died':
      return `${L(event.unitId)} goes down.`;
    case 'battle_ended':
      if (theater === 'siege') {
        return event.winningTeamId === DEFENSE_TEAM_DEFENDERS
          ? 'Hostiles routed — downtown holds.'
          : 'The Prefeitura falls.';
      }
      return event.winningTeamId === DEFENSE_TEAM_DEFENDERS
        ? 'Hostiles routed — perimeter holds.'
        : 'The wall gives — city breach!';
    default:
      return null;
  }
}

function allyNpcUnits(): import('./combat/core/types.ts').UnitSpec[] {
  const towerAttrs: CoreAttributes = { ...DEFAULT_CORE_ATTRIBUTES, strength: 4, agility: 1 };
  const guardAttrs: CoreAttributes = { ...DEFAULT_CORE_ATTRIBUTES, strength: 2, agility: 2 };
  return [
    {
      unitId: DEFENSE_NPC_TOWER_ID,
      teamId: DEFENSE_TEAM_DEFENDERS,
      role: 'ranged',
      tileId: '',
      attributes: towerAttrs,
      maxHp: DEFENSE_TOWER_MAX_HP,
      hp: DEFENSE_TOWER_MAX_HP,
      maxMana: 0,
      mana: 0,
      skillIds: [MOVE_ID_TOWER_RAJADA],
      speed: speedFromAgility(towerAttrs.agility),
      immobile: true,
    },
    ...DEFENSE_NPC_GUARD_IDS.map((id) => ({
      unitId: id,
      teamId: DEFENSE_TEAM_DEFENDERS,
      role: 'ranged' as const,
      tileId: '',
      attributes: guardAttrs,
      maxHp: DEFENSE_GUARD_MAX_HP,
      hp: DEFENSE_GUARD_MAX_HP,
      maxMana: 0,
      mana: 0,
      skillIds: [MOVE_ID_GUARD_DISPARO],
      speed: speedFromAgility(guardAttrs.agility),
      immobile: true,
    })),
  ];
}

/**
 * Resolve one nightly wall or Prefeitura siege with `simulateBattle`.
 * Wall loss zeroes the sector wall. Warrior cover (+30% HP) applies only while that wall stands.
 * Siege loss is the city hall anchor dying (or hostiles still standing when the clock ends).
 */
export function resolveDefenseFieldBattle(params: {
  daily: DailyDefenseState;
  hexMap: HexMap;
  theater: DefenseTheater;
  rng?: () => number;
  nowMs?: number;
}): ResolveDefenseFieldBattleResult {
  const { daily, theater } = params;
  const rng = params.rng ?? Math.random;
  const nowMs = params.nowMs ?? Date.now();
  const hexMap = params.hexMap;

  const wrongPhase =
    daily.isCompleted ||
    daily.phase !== 'fighting' ||
    (theater === 'wall' && daily.outcome !== 'active') ||
    (theater === 'siege' && daily.outcome !== 'prefeitura_siege');

  if (wrongPhase) {
    return {
      nextDaily: daily,
      wallResult: { breached: false },
      fightEnded: false,
      newLogLines: [],
    };
  }

  if (daily.enemies.length === 0 || daily.enemies.every((e) => e.currentHealth <= 0)) {
    return {
      nextDaily: {
        ...daily,
        enemies: [],
        totalEnemyPoints: 0,
        isCompleted: true,
        phase: 'ended',
        outcome: 'victory',
        currentTurn: daily.currentTurn + 1,
      },
      wallResult: { breached: false },
      fightEnded: true,
      newLogLines: [
        {
          turn: daily.currentTurn,
          timestamp: nowMs,
          text:
            theater === 'siege'
              ? 'No hostiles downtown — Prefeitura secured.'
              : 'No hostiles — defense stands down.',
          type: 'system',
        },
      ],
    };
  }

  const wallFeature =
    theater === 'wall' ? findWallFeature(hexMap.hexes[daily.targetHexId]?.features) : undefined;
  const coverBonus =
    theater === 'wall' && wallFeature && wallFeature.currentHp > 0
      ? NIGHTLY_WALL_COVER_HP_BONUS
      : 0;

  const names = new Map<string, string>();
  const playerIds = new Set<string>();
  const baseMaxById = new Map<string, number>();

  const defenderUnits = daily.defenderLine
    .filter((d) => d.currentHp > 0)
    .map((d) => {
      playerIds.add(d.characterId);
      names.set(d.characterId, d.name);
      baseMaxById.set(d.characterId, Math.max(1, d.maxHp));
      const attrs = d.coreAttributes ?? DEFAULT_CORE_ATTRIBUTES;
      const scaled = scaleCoverHp(d.currentHp, d.maxHp, coverBonus);
      const skills = d.skillIds && d.skillIds.length > 0 ? [...d.skillIds] : ['basic_attack'];
      return {
        unitId: d.characterId,
        teamId: DEFENSE_TEAM_DEFENDERS,
        role: roleFromBucket(d.tacticalBucket),
        tileId: '',
        attributes: attrs,
        maxHp: scaled.maxHp,
        hp: Math.max(1, scaled.hp),
        maxMana: 0,
        mana: 0,
        skillIds: skills,
        speed: speedFromAgility(attrs.agility),
      };
    });

  names.set(DEFENSE_NPC_TOWER_ID, DEFENSE_NPC_TOWER_LABEL);
  names.set(DEFENSE_NPC_GUARD_IDS[0], 'Wall guard');
  names.set(DEFENSE_NPC_GUARD_IDS[1], 'Wall guard');

  const hostileUnits = daily.enemies.map((enemy, index) => {
    const unitId = hostileUnitId(index);
    names.set(unitId, enemy.enemyId);
    return {
      unitId,
      teamId: DEFENSE_TEAM_HOSTILES,
      role: roleFromBucket(enemy.tacticalBucket),
      tileId: '',
      attributes: DEFAULT_CORE_ATTRIBUTES,
      maxHp: Math.max(1, enemy.maxHealth),
      hp: Math.max(0, enemy.currentHealth),
      maxMana: 0,
      mana: 0,
      skillIds: ['basic_attack'],
      speed: speedFromAgility(DEFAULT_CORE_ATTRIBUTES.agility),
    };
  });

  const structureUnits: import('./combat/core/types.ts').UnitSpec[] = [];
  if (theater === 'siege') {
    const hall = findCityHallFeature(hexMap.hexes[CENTER_HEX_ID]?.features);
    const maxHp = hall?.maxHp ?? PREFECTURE_STRUCTURE_MAX_HP;
    const hp = hall?.currentHp ?? 0;
    if (!hall || hp <= 0) {
      return terminalSiegeLoss(daily, hexMap, nowMs);
    }
    names.set(DEFENSE_CITY_HALL_UNIT_ID, 'Prefeitura');
    structureUnits.push({
      unitId: DEFENSE_CITY_HALL_UNIT_ID,
      teamId: DEFENSE_TEAM_DEFENDERS,
      role: 'frontline',
      tileId: '',
      attributes: DEFAULT_CORE_ATTRIBUTES,
      maxHp,
      hp,
      maxMana: 0,
      mana: 0,
      skillIds: [],
      speed: 0.1,
      immobile: true,
      vital: true,
    });
  }

  const result = simulateBattle({
    battleId: `${theater}:${daily.date}:${String(daily.gameDayIndex)}`,
    maxTicks: NIGHTLY_FIELD_MAX_TICKS,
    randomSource: rng,
    retreatHpFraction: DEFENSE_RETREAT_HP_FRACTION,
    retreatChance: theater === 'siege' ? 0 : 0.35,
    permadeathChance: 0,
    units: [...defenderUnits, ...allyNpcUnits(), ...structureUnits, ...hostileUnits],
  });

  const pb = playback(result.canonicalEvents);
  const defendersWon = result.finalState.winningTeamId === DEFENSE_TEAM_DEFENDERS;
  const hostilesWon = result.finalState.winningTeamId === DEFENSE_TEAM_HOSTILES;

  const nextLine: DefenderLineEntry[] = daily.defenderLine.map((d) => {
    const unit = pb.unitsById[d.characterId];
    if (!unit) return d;
    const baseMax = baseMaxById.get(d.characterId) ?? d.maxHp;
    const currentHp = unscaleCoverHp(unit.hp, unit.maxHp, baseMax);
    return {
      ...d,
      currentHp,
      maxHp: baseMax,
      retreated: unit.retreated || currentHp <= 0,
    };
  });

  const nextEnemies: EnemyInstance[] = daily.enemies.flatMap((enemy, index) => {
    const unit = pb.unitsById[hostileUnitId(index)];
    if (!unit || !unit.alive || unit.retreated || unit.hp <= 0) return [];
    return [{ ...enemy, currentHealth: unit.hp, maxHealth: enemy.maxHealth }];
  });

  let outcome: NightlyDefenseOutcome;
  let breached = false;
  let nextMap: HexMap | undefined;

  if (theater === 'wall') {
    const cleared = defendersWon || nextEnemies.length === 0;
    if (cleared && !hostilesWon) {
      outcome = 'victory';
    } else {
      outcome = 'breach';
      breached = true;
      nextMap = zeroWall(hexMap, daily.targetHexId);
    }
  } else {
    const hallUnit = pb.unitsById[DEFENSE_CITY_HALL_UNIT_ID];
    const hallHp = hallUnit?.alive ? hallUnit.hp : 0;
    const hallMax = hallUnit?.maxHp ?? PREFECTURE_STRUCTURE_MAX_HP;
    nextMap = setCityHallFeatureHp(hexMap, CENTER_HEX_ID, hallHp, hallMax);
    if (defendersWon && hallHp > 0 && nextEnemies.length === 0) {
      outcome = 'victory';
    } else {
      outcome = 'loss';
    }
  }

  const lines: Omit<CombatLogEntry, 'id'>[] = [
    {
      turn: daily.currentTurn,
      timestamp: nowMs,
      text:
        theater === 'siege'
          ? 'They are inside the city. Prefeitura last stand.'
          : 'The perimeter line locks. Hostiles hit the sector.',
      type: 'system',
    },
  ];

  for (const group of groupCanonicalEventsByTick(result.canonicalEvents)) {
    for (const event of group.events) {
      const text = eventToText(event, names, theater);
      if (!text) continue;
      lines.push({
        turn: group.tick,
        timestamp: nowMs,
        text,
        type: actorFor(event, playerIds),
      });
    }
  }

  if (!lines.some((l) => l.text.includes('routed') || l.text.includes('breach') || l.text.includes('falls'))) {
    lines.push({
      turn: result.finalState.ticksElapsed,
      timestamp: nowMs,
      text:
        outcome === 'victory'
          ? theater === 'siege'
            ? 'Hostiles routed — downtown holds.'
            : 'Hostiles routed — perimeter holds.'
          : theater === 'siege'
            ? 'The Prefeitura falls.'
            : 'The wall gives — city breach!',
      type: 'system',
      highlight: true,
    });
  }

  return {
    nextDaily: {
      ...daily,
      currentTurn: daily.currentTurn + 1,
      defenderLine: nextLine,
      enemies: outcome === 'victory' ? [] : nextEnemies,
      totalEnemyPoints: sumLivingThreatPoints(outcome === 'victory' ? [] : nextEnemies),
      outcome,
      phase: 'ended',
      isCompleted: true,
    },
    wallResult: { breached, hexMap: nextMap },
    fightEnded: true,
    newLogLines: lines,
    hexMap: nextMap,
  };
}

function terminalSiegeLoss(
  daily: DailyDefenseState,
  hexMap: HexMap,
  nowMs: number,
): ResolveDefenseFieldBattleResult {
  const nextMap = setCityHallFeatureHp(hexMap, CENTER_HEX_ID, 0, PREFECTURE_STRUCTURE_MAX_HP);
  return {
    nextDaily: {
      ...daily,
      currentTurn: daily.currentTurn + 1,
      outcome: 'loss',
      phase: 'ended',
      isCompleted: true,
      victoryLootPool: [],
    },
    wallResult: { breached: false, hexMap: nextMap },
    fightEnded: true,
    newLogLines: [
      {
        turn: daily.currentTurn,
        timestamp: nowMs,
        text: 'The Prefeitura falls.',
        type: 'system',
        highlight: true,
      },
    ],
    hexMap: nextMap,
  };
}
