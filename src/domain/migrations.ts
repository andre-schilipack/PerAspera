import { GAME_VERSION, SCHEMA_VERSION } from './constants.ts';
import type { GameMetaState, NextIdCounters } from './types/index.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function defaultNextIds(): NextIdCounters {
  return {
    character: 0,
    combatLogEntry: 0,
    business: 0,
    placeSlot: 0,
  };
}

/**
 * Ensures persisted meta matches {@link SCHEMA_VERSION}.
 * Extend with `switch (fromVersion)` when schema increments.
 */
export function migrateGameMetaState(raw: unknown): GameMetaState {
  if (!isRecord(raw)) {
    throw new Error('migrateGameMetaState: root must be an object');
  }

  let schemaVersion =
    typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  const version =
    typeof raw.version === 'string' && raw.version.length > 0
      ? raw.version
      : GAME_VERSION;

  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();

  let globalScoreboard = raw.globalScoreboard;
  if (!Array.isArray(globalScoreboard)) {
    globalScoreboard = [];
  }

  const nextIdsRaw = raw.nextIds;
  const nextIds: NextIdCounters = defaultNextIds();
  if (isRecord(nextIdsRaw)) {
    if (typeof nextIdsRaw.character === 'number') {
      nextIds.character = nextIdsRaw.character;
    }
    if (typeof nextIdsRaw.combatLogEntry === 'number') {
      nextIds.combatLogEntry = nextIdsRaw.combatLogEntry;
    }
    if (typeof nextIdsRaw.business === 'number') {
      nextIds.business = nextIdsRaw.business;
    }
    if (typeof nextIdsRaw.placeSlot === 'number') {
      nextIds.placeSlot = nextIdsRaw.placeSlot;
    }
  }

  // Placeholder for future transforms when schemaVersion < N.
  if (schemaVersion < 1) {
    schemaVersion = 1;
  }

  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `migrateGameMetaState: unsupported schemaVersion ${schemaVersion} (expected ${SCHEMA_VERSION})`,
    );
  }

  return {
    version,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    globalScoreboard: globalScoreboard as GameMetaState['globalScoreboard'],
    nextIds,
  };
}
