import type { BattleResult } from '../core/types.ts';
import type { CanonicalEvent, SchemaVersion, UnitId } from '../core/events.ts';

export const COMBAT_EVENT_SCHEMA_VERSION: SchemaVersion = 1;

export function isSchemaVersionSupported(v: number): v is SchemaVersion {
  return v === 1;
}

export function assertBattleResultSchema(result: BattleResult): void {
  if (!isSchemaVersionSupported(result.schemaVersion)) {
    throw new Error(`Unsupported combat schemaVersion: ${String(result.schemaVersion)}`);
  }
}

/**
 * Slice 2: v1 is the only supported schema. Keep this function so future bumps
 * have a stable callsite.
 */
export function migrateBattleResult(result: BattleResult): BattleResult {
  assertBattleResultSchema(result);
  return result;
}

export function validateEventRefs(events: readonly CanonicalEvent[]): void {
  const spawned = new Set<UnitId>();
  for (const e of events) {
    if (e.type === 'unit_spawned') spawned.add(e.unitId);
  }
  for (const e of events) {
    switch (e.type) {
      case 'unit_spawned':
      case 'tick_advanced':
      case 'battle_ended':
        break;
      case 'unit_acted':
        if (!spawned.has(e.unitId)) {
          throw new Error(`Event refs unknown unitId: ${e.type} unitId=${e.unitId}`);
        }
        if (e.targetId && !spawned.has(e.targetId)) {
          throw new Error(`Event refs unknown targetId: ${e.type} targetId=${e.targetId}`);
        }
        break;
      case 'damage_dealt':
        if (!spawned.has(e.sourceId)) {
          throw new Error(`Event refs unknown sourceId: ${e.type} sourceId=${e.sourceId}`);
        }
        if (!spawned.has(e.targetId)) {
          throw new Error(`Event refs unknown targetId: ${e.type} targetId=${e.targetId}`);
        }
        break;
      case 'healed':
        if (!spawned.has(e.sourceId)) {
          throw new Error(`Event refs unknown sourceId: ${e.type} sourceId=${e.sourceId}`);
        }
        if (!spawned.has(e.targetId)) {
          throw new Error(`Event refs unknown targetId: ${e.type} targetId=${e.targetId}`);
        }
        break;
      case 'status_applied':
        if (!spawned.has(e.sourceId)) {
          throw new Error(`Event refs unknown sourceId: ${e.type} sourceId=${e.sourceId}`);
        }
        if (!spawned.has(e.targetId)) {
          throw new Error(`Event refs unknown targetId: ${e.type} targetId=${e.targetId}`);
        }
        break;
      case 'unit_died':
        if (!spawned.has(e.unitId)) {
          throw new Error(`Event refs unknown unitId: ${e.type} unitId=${e.unitId}`);
        }
        if (e.sourceId && !spawned.has(e.sourceId)) {
          throw new Error(`Event refs unknown sourceId: ${e.type} sourceId=${e.sourceId}`);
        }
        break;
      default: {
        const _exhaustive: never = e;
        throw new Error(`Unhandled event type: ${String(_exhaustive)}`);
      }
    }
  }
}

