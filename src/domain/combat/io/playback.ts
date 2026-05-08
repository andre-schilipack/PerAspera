import type { BattleStateSummary } from '../core/types.ts';
import type { CanonicalEvent, TeamId, UnitId } from '../core/events.ts';
import { validateEventRefs } from './eventSchema.ts';

export interface PlaybackUnitState {
  unitId: UnitId;
  teamId: TeamId;
  tileId: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  retreated: boolean;
}

export interface PlaybackResult {
  finalState: BattleStateSummary;
  unitsById: Record<UnitId, PlaybackUnitState>;
  ticksElapsed: number;
}

export function playback(events: readonly CanonicalEvent[]): PlaybackResult {
  validateEventRefs(events);

  const unitsById: Record<UnitId, PlaybackUnitState> = {};
  let ticksElapsed = 0;
  let winningTeamId: TeamId | null = null;

  for (const e of events) {
    ticksElapsed = Math.max(ticksElapsed, e.t);
    switch (e.type) {
      case 'tick_advanced':
        break;
      case 'unit_spawned':
        unitsById[e.unitId] = {
          unitId: e.unitId,
          teamId: e.teamId,
          tileId: e.tileId,
          hp: e.hp,
          maxHp: e.maxHp,
          mana: e.mana,
          maxMana: e.maxMana,
          alive: e.hp > 0,
          retreated: false,
        };
        break;
      case 'unit_moved': {
        const u = unitsById[e.unitId];
        if (!u) break;
        u.tileId = e.toTileId;
        break;
      }
      case 'unit_acted':
        // No state change required for slice 2 playback.
        break;
      case 'damage_dealt': {
        const target = unitsById[e.targetId];
        if (!target) break;
        if (!target.alive) break;
        const dmg = Math.max(0, Math.floor(e.amount));
        if (dmg <= 0) break;
        target.hp = Math.max(0, target.hp - dmg);
        if (target.hp <= 0) target.alive = false;
        break;
      }
      case 'healed': {
        const target = unitsById[e.targetId];
        if (!target) break;
        if (!target.alive) break;
        const amt = Math.max(0, Math.floor(e.amount));
        if (amt <= 0) break;
        target.hp = Math.min(target.maxHp, target.hp + amt);
        break;
      }
      case 'status_applied':
        // Slice 3: status effects don't affect playback state yet (only outcomes do).
        break;
      case 'unit_retreated': {
        const u = unitsById[e.unitId];
        if (!u) break;
        u.retreated = true;
        break;
      }
      case 'unit_died': {
        const u = unitsById[e.unitId];
        if (!u) break;
        u.hp = 0;
        u.alive = false;
        break;
      }
      case 'battle_ended':
        winningTeamId = e.winningTeamId;
        break;
      default: {
        const _exhaustive: never = e;
        throw new Error(`Unhandled event type: ${String(_exhaustive)}`);
      }
    }
  }

  const livingUnitsByTeam: Record<TeamId, number> = {};
  for (const u of Object.values(unitsById)) {
    if (!u.alive || u.retreated) continue;
    livingUnitsByTeam[u.teamId] = (livingUnitsByTeam[u.teamId] ?? 0) + 1;
  }

  return {
    unitsById,
    ticksElapsed,
    finalState: {
      winningTeamId,
      ticksElapsed,
      livingUnitsByTeam,
    },
  };
}

