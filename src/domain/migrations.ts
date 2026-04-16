import { GAME_VERSION, SCHEMA_VERSION } from './constants.ts';
import type {
  GameMetaState,
  GameOverReason,
  HallOfFameEntry,
  NextIdCounters,
  ScoreEntry,
} from './types/index.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function defaultNextIds(): NextIdCounters {
  return {
    character: 0,
    combatLogEntry: 0,
    business: 0,
    placeSlot: 0,
    contract: 0,
  };
}

function parseScoreEntryLoose(raw: unknown): ScoreEntry | null {
  if (!isRecord(raw)) return null;
  const characterId =
    typeof raw.characterId === 'string' ? raw.characterId : '';
  const name = typeof raw.name === 'string' ? raw.name : '';
  const score = typeof raw.score === 'number' ? raw.score : 0;
  const updatedAt =
    typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
  if (!characterId || !name) return null;
  return { characterId, name, score, updatedAt };
}

function parseHallOfFameLoose(raw: unknown): HallOfFameEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HallOfFameEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const fameRaw = item.fameList;
    if (!Array.isArray(fameRaw)) continue;
    const fameList: ScoreEntry[] = [];
    for (const e of fameRaw) {
      const parsed = parseScoreEntryLoose(e);
      if (parsed) fameList.push(parsed);
    }
    const gameOverDateTime = item.gameOverDateTime;
    const daysSurvived = item.daysSurvived;
    if (
      typeof gameOverDateTime !== 'number' ||
      !Number.isFinite(gameOverDateTime) ||
      typeof daysSurvived !== 'number' ||
      !Number.isFinite(daysSurvived)
    ) {
      continue;
    }
    const reason: GameOverReason =
      item.reason === 'prefeitura_fallen' ? 'prefeitura_fallen' : 'prefeitura_fallen';
    out.push({ fameList, gameOverDateTime, daysSurvived, reason });
  }
  return out;
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
    if (typeof nextIdsRaw.contract === 'number') {
      nextIds.contract = nextIdsRaw.contract;
    }
  }

  if (schemaVersion < 1) {
    schemaVersion = 1;
  }
  if (schemaVersion < 2) {
    schemaVersion = 2;
  }
  if (schemaVersion < 3) {
    schemaVersion = 3;
  }
  if (schemaVersion < 4) {
    schemaVersion = 4;
  }

  const hallOfFame = parseHallOfFameLoose(raw.hallOfFame);

  let gameOver = false;
  let gameOverReason: GameOverReason | null = null;
  let gameOverAt: number | null = null;
  if (typeof raw.gameOver === 'boolean') {
    gameOver = raw.gameOver;
  }
  if (raw.gameOverReason === 'prefeitura_fallen') {
    gameOverReason = 'prefeitura_fallen';
  }
  if (
    typeof raw.gameOverAt === 'number' &&
    Number.isFinite(raw.gameOverAt)
  ) {
    gameOverAt = raw.gameOverAt;
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
    hallOfFame,
    nextIds,
    gameOver,
    gameOverReason,
    gameOverAt,
  };
}
