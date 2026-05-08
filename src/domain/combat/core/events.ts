import type { MoveDamageKind } from '../../types/combat.ts';

export type SchemaVersion = 1;

export type BattleId = string;
export type UnitId = string;
export type TeamId = string;
export type SkillId = string;
export type StatusId = string;

/** Stable axial key: "q,r" (no spaces). */
export type TileId = string;

export type UnitRole = 'frontline' | 'ranged' | 'support';

export type CanonicalEvent =
  | { t: number; eventIndex: number; type: 'tick_advanced' }
  | {
      t: number;
      eventIndex: number;
      type: 'unit_spawned';
      unitId: UnitId;
      teamId: TeamId;
      role: UnitRole;
      tileId: TileId;
      hp: number;
      maxHp: number;
      mana: number;
      maxMana: number;
    }
  | {
      t: number;
      eventIndex: number;
      type: 'unit_moved';
      unitId: UnitId;
      fromTileId: TileId;
      toTileId: TileId;
    }
  | {
      t: number;
      eventIndex: number;
      type: 'unit_acted';
      unitId: UnitId;
      action: 'attack' | 'cast' | 'move' | 'retreat' | 'wait';
      targetId?: UnitId;
      skillId?: SkillId;
      toTileId?: TileId;
    }
  | {
      t: number;
      eventIndex: number;
      type: 'damage_dealt';
      sourceId: UnitId;
      targetId: UnitId;
      amount: number;
      damageKind: MoveDamageKind;
      flags: { dodged?: boolean; blocked?: boolean; crit?: boolean };
    }
  | {
      t: number;
      eventIndex: number;
      type: 'healed';
      sourceId: UnitId;
      targetId: UnitId;
      amount: number;
    }
  | {
      t: number;
      eventIndex: number;
      type: 'status_applied';
      sourceId: UnitId;
      targetId: UnitId;
      statusId: StatusId;
      turns?: number;
    }
  | {
      t: number;
      eventIndex: number;
      type: 'unit_retreated';
      unitId: UnitId;
      reason: string;
    }
  | {
      t: number;
      eventIndex: number;
      type: 'unit_died';
      unitId: UnitId;
      sourceId?: UnitId;
      permadeath: boolean;
    }
  | {
      t: number;
      eventIndex: number;
      type: 'battle_ended';
      winningTeamId: TeamId;
    };

export interface CanonicalEventWriter {
  readonly schemaVersion: SchemaVersion;
  readonly events: CanonicalEvent[];
  readonly currentTick: number;
  readonly nextEventIndex: number;
  advanceToTick(t: number): void;
  push(event: Omit<CanonicalEvent, 't' | 'eventIndex'> & { type: CanonicalEvent['type'] }): void;
}

export function createCanonicalEventWriter(): CanonicalEventWriter {
  const events: CanonicalEvent[] = [];
  let currentTick = 0;
  let nextEventIndex = 0;

  const advanceToTick = (t: number) => {
    const nextT = Math.max(0, Math.floor(t));
    if (nextT !== currentTick) {
      currentTick = nextT;
      events.push({ t: currentTick, eventIndex: nextEventIndex++, type: 'tick_advanced' });
    }
  };

  return {
    schemaVersion: 1,
    events,
    get currentTick() {
      return currentTick;
    },
    get nextEventIndex() {
      return nextEventIndex;
    },
    advanceToTick,
    push: (e) => {
      // Keep events strictly ordered in (t,eventIndex).
      events.push({ ...(e as any), t: currentTick, eventIndex: nextEventIndex++ });
    },
  };
}

