import type { CanonicalEvent } from '../core/events.ts';

export function canonicalEventsToCombatText(
  events: readonly CanonicalEvent[],
): string[] {
  const lines: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'tick_advanced':
        lines.push(`[t${String(e.t)}]`);
        break;
      case 'unit_spawned':
        lines.push(
          `[t${String(e.t)}] spawn ${e.unitId} (team ${e.teamId}) hp=${String(
            e.hp,
          )}/${String(e.maxHp)}`,
        );
        break;
      case 'unit_moved':
        lines.push(
          `[t${String(e.t)}] ${e.unitId} moves ${e.fromTileId} -> ${e.toTileId}`,
        );
        break;
      case 'unit_acted':
        lines.push(
          `[t${String(e.t)}] ${e.unitId} ${e.action}${
            e.skillId ? ` ${e.skillId}` : ''
          }${e.toTileId ? ` -> ${e.toTileId}` : ''}${
            e.targetId ? ` -> ${e.targetId}` : ''
          }`,
        );
        break;
      case 'damage_dealt': {
        const flags = [
          e.flags.dodged ? 'dodged' : null,
          e.flags.blocked ? 'blocked' : null,
          e.flags.crit ? 'crit' : null,
        ].filter(Boolean);
        lines.push(
          `[t${String(e.t)}] ${e.sourceId} hits ${e.targetId} for ${String(
            e.amount,
          )} ${e.damageKind}${flags.length ? ` (${flags.join(',')})` : ''}`,
        );
        break;
      }
      case 'unit_died':
        lines.push(
          `[t${String(e.t)}] ${e.unitId} died${
            e.sourceId ? ` (by ${e.sourceId})` : ''
          }`,
        );
        break;
      case 'healed':
        lines.push(
          `[t${String(e.t)}] ${e.sourceId} heals ${e.targetId} for ${String(
            e.amount,
          )}`,
        );
        break;
      case 'status_applied':
        lines.push(
          `[t${String(e.t)}] ${e.sourceId} applies ${e.statusId} to ${e.targetId}${
            e.turns ? ` (${String(e.turns)}t)` : ''
          }`,
        );
        break;
      case 'battle_ended':
        lines.push(`[t${String(e.t)}] battle ended: winner=${e.winningTeamId}`);
        break;
      default: {
        void e;
        lines.push(`[t${String((e as any).t)}] unknown event`);
        break;
      }
    }
  }
  return lines;
}

