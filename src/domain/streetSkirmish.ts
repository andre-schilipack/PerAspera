import { DEFAULT_COMBAT_LOADOUT } from './characterNormalize.ts';
import { simulateBattle } from './combat/index.ts';
import { playback } from './combat/io/playback.ts';
import { groupCanonicalEventsByTick } from './combat/io/groupByTick.ts';
import { STREET_SKIRMISH_MAX_TICKS } from './constants.ts';
import {
  DEFAULT_CORE_ATTRIBUTES,
  type CoreAttributes,
} from './types/attributes.ts';
import type { CombatLogActor, CombatLogEntry } from './types/combat.ts';
import type {
  StreetSkirmishOutcome,
  StreetSkirmishSession,
} from './types/skirmish.ts';
import type { AlgoProgram } from './combat/ai/policy.ts';
import type { UnitRole } from './combat/core/events.ts';
import type { BattleResult } from './combat/core/types.ts';

export const STREET_TEAM_PLAYER = 'player' as const;
export const STREET_TEAM_HOSTILE = 'hostile' as const;
export const STREET_DRONE_UNIT_ID = 'enemy_street_drone' as const;
export const STREET_DRONE_LABEL = 'a rust drone';

export interface RunStreetSkirmishParams {
  battleId: string;
  hexId: string;
  danger: number;
  characterId: string;
  characterName: string;
  playerHealth: number;
  playerMaxHealth: number;
  coreAttributes?: CoreAttributes;
  skillIds?: readonly string[];
  combatRole?: UnitRole;
  /** Set only when the character loadout is in AlgoCombat mode. */
  algoProgram?: AlgoProgram;
  /** Injectable RNG for tests. */
  randomSource?: () => number;
  /** First combat log id (inclusive). */
  firstLogId: number;
  /** Wall-clock for log timestamps. */
  nowMs?: number;
}

/** Initiative speed from agility (higher agility → acts more often). */
export function speedFromAgility(agility: number): number {
  const a = Number.isFinite(agility) ? agility : 1;
  return Math.max(0.1, a);
}

function droneHpFromDanger(danger: number): number {
  return 16 + Math.floor(Math.max(0, Math.min(100, danger)) / 12);
}

function eventToActor(
  e: import('./combat/core/events.ts').CanonicalEvent,
  playerUnitId: string,
): CombatLogActor {
  if (e.type === 'damage_dealt' || e.type === 'healed' || e.type === 'status_applied') {
    return e.sourceId === playerUnitId ? 'player' : 'enemy';
  }
  if (
    e.type === 'unit_acted' ||
    e.type === 'unit_moved' ||
    e.type === 'unit_died' ||
    e.type === 'unit_retreated'
  ) {
    return e.unitId === playerUnitId ? 'player' : 'enemy';
  }
  return 'system';
}

function labelUnit(
  unitId: string,
  playerUnitId: string,
  playerName: string,
): string {
  if (unitId === STREET_DRONE_UNIT_ID) return STREET_DRONE_LABEL;
  if (unitId === playerUnitId) return playerName;
  return unitId;
}

function eventToText(
  e: import('./combat/core/events.ts').CanonicalEvent,
  playerUnitId: string,
  playerName: string,
): string | null {
  const L = (id: string) => labelUnit(id, playerUnitId, playerName);
  switch (e.type) {
    case 'tick_advanced':
    case 'unit_spawned':
      return null;
    case 'unit_moved':
      return `${L(e.unitId)} closes in.`;
    case 'unit_acted':
      if (e.action === 'attack') {
        return `${L(e.unitId)} strikes${e.targetId ? ` at ${L(e.targetId)}` : ''}.`;
      }
      if (e.action === 'cast') {
        return `${L(e.unitId)} uses ${e.skillId ?? 'a skill'}.`;
      }
      if (e.action === 'move') return null;
      if (e.action === 'wait') return `${L(e.unitId)} holds.`;
      if (e.action === 'retreat') {
        return `${L(e.unitId)} tries to break off.`;
      }
      return `${L(e.unitId)} acts.`;
    case 'damage_dealt': {
      if (e.flags.dodged) {
        return `${L(e.targetId)} dodges ${L(e.sourceId)}.`;
      }
      const blocked = e.flags.blocked ? ' (blocked)' : '';
      return `${L(e.sourceId)} hits ${L(e.targetId)} for ${String(e.amount)}${blocked}.`;
    }
    case 'healed':
      return `${L(e.sourceId)} heals ${L(e.targetId)} for ${String(e.amount)}.`;
    case 'status_applied':
      return `${L(e.targetId)} gains ${e.statusId}.`;
    case 'unit_retreated':
      return `${L(e.unitId)} retreats.`;
    case 'unit_died':
      return `${L(e.unitId)} goes down.`;
    case 'battle_ended':
      return e.winningTeamId === STREET_TEAM_PLAYER
        ? 'Street clear.'
        : e.winningTeamId === STREET_TEAM_HOSTILE
          ? 'You go down in the scrap.'
          : 'The fight breaks off.';
    default:
      return null;
  }
}

function buildCombatLog(params: {
  result: BattleResult;
  playerUnitId: string;
  playerName: string;
  firstLogId: number;
  nowMs: number;
}): CombatLogEntry[] {
  const { result, playerUnitId, playerName, firstLogId, nowMs } = params;
  const opening: CombatLogEntry = {
    id: firstLogId,
    turn: 0,
    timestamp: nowMs,
    text: 'Rust and eyes — something steps out of the dark.',
    type: 'system',
  };

  const lines: CombatLogEntry[] = [opening];
  let nextId = firstLogId + 1;

  for (const group of groupCanonicalEventsByTick(result.canonicalEvents)) {
    for (const e of group.events) {
      const text = eventToText(e, playerUnitId, playerName);
      if (!text) continue;
      lines.push({
        id: nextId++,
        turn: group.tick,
        timestamp: nowMs,
        text,
        type: eventToActor(e, playerUnitId),
      });
    }
  }

  return lines;
}

function outcomeFromBattle(
  result: BattleResult,
  playerAlive: boolean,
  enemyAlive: boolean,
): StreetSkirmishOutcome {
  if (result.finalState.winningTeamId === STREET_TEAM_PLAYER) return 'win';
  if (result.finalState.winningTeamId === STREET_TEAM_HOSTILE) return 'loss';
  if (!playerAlive && enemyAlive) return 'loss';
  if (playerAlive && !enemyAlive) return 'win';
  return 'draw';
}

/**
 * Resolve a 1v1 street fight in one `simulateBattle` call (no stepwise resume).
 */
export function runStreetSkirmish(
  params: RunStreetSkirmishParams,
): StreetSkirmishSession {
  const attrs = params.coreAttributes ?? DEFAULT_CORE_ATTRIBUTES;
  const skillIds =
    params.skillIds && params.skillIds.length > 0
      ? [...params.skillIds]
      : [...DEFAULT_COMBAT_LOADOUT.skillIds];
  const role = params.combatRole ?? 'frontline';
  const nowMs = params.nowMs ?? Date.now();
  const playerHp = Math.max(1, Math.min(params.playerMaxHealth, params.playerHealth));
  const enemyMaxHp = droneHpFromDanger(params.danger);

  const result = simulateBattle({
    battleId: params.battleId,
    maxTicks: STREET_SKIRMISH_MAX_TICKS,
    randomSource: params.randomSource,
    // Street fights resolve to win/loss; retreat is a future UX choice.
    retreatChance: 0,
    permadeathChance: 0,
    units: [
      {
        unitId: params.characterId,
        teamId: STREET_TEAM_PLAYER,
        role,
        tileId: '',
        attributes: attrs,
        maxHp: params.playerMaxHealth,
        hp: playerHp,
        maxMana: 0,
        mana: 0,
        skillIds,
        speed: speedFromAgility(attrs.agility),
        algoProgram: params.algoProgram,
      },
      {
        unitId: STREET_DRONE_UNIT_ID,
        teamId: STREET_TEAM_HOSTILE,
        role: 'frontline',
        tileId: '',
        attributes: DEFAULT_CORE_ATTRIBUTES,
        maxHp: enemyMaxHp,
        hp: enemyMaxHp,
        maxMana: 0,
        mana: 0,
        skillIds: [],
        speed: speedFromAgility(DEFAULT_CORE_ATTRIBUTES.agility),
      },
    ],
  });

  const pb = playback(result.canonicalEvents);
  const playerUnit = pb.unitsById[params.characterId];
  const enemyUnit = pb.unitsById[STREET_DRONE_UNIT_ID];
  const playerAlive = !!playerUnit?.alive && !playerUnit.retreated;
  const enemyAlive = !!enemyUnit?.alive && !enemyUnit.retreated;

  const combatLog = buildCombatLog({
    result,
    playerUnitId: params.characterId,
    playerName: params.characterName,
    firstLogId: params.firstLogId,
    nowMs,
  });

  return {
    hexId: params.hexId,
    danger: params.danger,
    characterId: params.characterId,
    characterName: params.characterName,
    playerHealth: playerUnit?.hp ?? 0,
    playerMaxHealth: params.playerMaxHealth,
    enemyLabel: STREET_DRONE_LABEL,
    enemyHp: enemyUnit?.hp ?? 0,
    enemyMaxHp: enemyMaxHp,
    outcome: outcomeFromBattle(result, playerAlive, enemyAlive),
    combatLog,
    battleResult: result,
    rewardsApplied: false,
  };
}
