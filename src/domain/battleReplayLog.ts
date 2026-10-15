import type { CanonicalEvent } from './combat/core/events.ts';
import { groupCanonicalEventsByTick } from './combat/io/groupByTick.ts';
import {
  DEFENSE_CITY_HALL_UNIT_ID,
  DEFENSE_NPC_TOWER_ID,
  OFFENSIVE_NEST_STRUCTURE_UNIT_ID,
} from './constants.ts';
import type { CombatLogActor, CombatLogEntry } from './types/combat.ts';
import type { BattleReel } from './types/battleArchive.ts';

const CITY_TEAMS = new Set(['city', 'attackers', 'defenders', 'player']);
const HOSTILE_TEAMS = new Set(['drones', 'nest', 'hostiles', 'hostile']);

const STRUCTURE_IDS = new Set<string>([
  DEFENSE_CITY_HALL_UNIT_ID,
  DEFENSE_NPC_TOWER_ID,
  OFFENSIVE_NEST_STRUCTURE_UNIT_ID,
]);

function labelFor(unitId: string, names: Readonly<Record<string, string>>): string {
  return names[unitId] ?? unitId;
}

function eventUnitId(event: CanonicalEvent): string | undefined {
  if (
    event.type === 'damage_dealt' ||
    event.type === 'healed' ||
    event.type === 'status_applied'
  ) {
    return event.sourceId;
  }
  if ('unitId' in event) return event.unitId;
  return undefined;
}

function actorFor(
  unitId: string | undefined,
  teamByUnit: ReadonlyMap<string, string>,
  playerIds: ReadonlySet<string>,
): CombatLogActor {
  if (!unitId) return 'system';
  if (playerIds.has(unitId)) return 'player';
  if (STRUCTURE_IDS.has(unitId) || unitId.startsWith('structure_')) return 'wall';
  const team = teamByUnit.get(unitId);
  if (team && CITY_TEAMS.has(team)) return 'guarda';
  if (team && HOSTILE_TEAMS.has(team)) return 'enemy';
  return 'system';
}

function eventToText(
  event: CanonicalEvent,
  names: Readonly<Record<string, string>>,
): string | null {
  const L = (id: string) => labelFor(id, names);
  switch (event.type) {
    case 'tick_advanced':
    case 'unit_spawned':
    case 'unit_moved':
    case 'battle_ended':
      return null;
    case 'unit_acted':
      if (event.action === 'wait' || event.action === 'move') return null;
      if (event.action === 'retreat') return `${L(event.unitId)} tenta romper.`;
      if (event.action === 'cast') return `${L(event.unitId)} dispara.`;
      if (event.action === 'attack') {
        return event.targetId
          ? `${L(event.unitId)} ataca ${L(event.targetId)}.`
          : `${L(event.unitId)} ataca.`;
      }
      return null;
    case 'damage_dealt':
      if (event.flags.dodged) {
        return `${L(event.targetId)} desvia de ${L(event.sourceId)}.`;
      }
      if (event.amount <= 0) return null;
      return `${L(event.sourceId)} acerta ${L(event.targetId)} e tira ${String(event.amount)}${event.flags.blocked ? ' (bloqueado)' : ''}.`;
    case 'healed':
      return `${L(event.sourceId)} cura ${L(event.targetId)} em ${String(event.amount)}.`;
    case 'status_applied':
      return `${L(event.targetId)} recebe ${event.statusId}.`;
    case 'unit_retreated':
      return `${L(event.unitId)} recua.`;
    case 'unit_died':
      return `${L(event.unitId)} cai.`;
    default:
      return null;
  }
}

function expansionOutro(outcome: string): string {
  if (outcome === 'victory') return 'Hex limpo. A fronteira abre.';
  if (outcome === 'interrupted') {
    return 'O esquadrão recuou. O hex continua hostil.';
  }
  return 'A limpeza falhou. O esquadrão volta ao Centro.';
}

function genericOutro(outcome: string): string {
  if (outcome === 'victory' || outcome === 'win') return 'Vitória.';
  if (outcome === 'interrupted') return 'Interrompida — a força recuou.';
  if (outcome === 'breach') return 'A muralha cedeu.';
  if (outcome === 'loss' || outcome === 'defeat') return 'Derrota.';
  return outcome;
}

/**
 * Rebuild the modal feed from a stored reel. Does not re-simulate.
 */
export function replayCombatLog(reel: BattleReel): CombatLogEntry[] {
  const names = reel.unitNames;
  const playerIds = new Set(reel.participantCharacterIds);
  const teamByUnit = new Map<string, string>();
  for (const event of reel.battleResult.canonicalEvents) {
    if (event.type === 'unit_spawned') teamByUnit.set(event.unitId, event.teamId);
  }

  const lines: Omit<CombatLogEntry, 'id'>[] = [
    {
      turn: 0,
      timestamp: reel.at,
      text: reel.title,
      type: 'system',
    },
  ];

  for (const group of groupCanonicalEventsByTick(reel.battleResult.canonicalEvents)) {
    for (const event of group.events) {
      const text = eventToText(event, names);
      if (!text) continue;
      lines.push({
        turn: group.tick,
        timestamp: reel.at,
        text,
        type: actorFor(eventUnitId(event), teamByUnit, playerIds),
      });
    }
  }

  const lastTick = reel.battleResult.finalState.ticksElapsed;
  lines.push({
    turn: lastTick,
    timestamp: reel.at,
    text: reel.kind === 'expansion' ? expansionOutro(reel.outcome) : genericOutro(reel.outcome),
    type: 'system',
    highlight: true,
  });

  return lines.map((line, index) => ({ ...line, id: index + 1 }));
}
