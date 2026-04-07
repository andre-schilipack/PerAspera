import { formatLocalDateString } from '../domain/defenseSchedule.ts';
import { createEmptyDailyDefense } from '../domain/factories/createDefenseSeed.ts';
import { migrateGameMetaState } from '../domain/migrations.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { applyStaminaRegenToAllCharacters } from './staminaRegenTick.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';
import type { GameMetaState } from '../domain/types/index.ts';

function pickMetaSnapshot(state: ReturnType<typeof useMetaStore.getState>): GameMetaState {
  return {
    version: state.version,
    schemaVersion: state.schemaVersion,
    createdAt: state.createdAt,
    globalScoreboard: state.globalScoreboard,
    nextIds: state.nextIds,
  };
}

async function rehydrateAllStores(): Promise<void> {
  await Promise.all([
    useMetaStore.persist.rehydrate(),
    useCharactersStore.persist.rehydrate(),
    useWorldStore.persist.rehydrate(),
    useDefenseStore.persist.rehydrate(),
    useContractsStore.persist.rehydrate(),
  ]);
}

function runMetaMigration(): void {
  const migrated = migrateGameMetaState(pickMetaSnapshot(useMetaStore.getState()));
  useMetaStore.getState().applyMetaSnapshot(migrated);
}

function rollDailyDefenseIfNeeded(now: number): void {
  const today = formatLocalDateString(new Date(now));
  const { dailyDefense, setDailyDefense } = useDefenseStore.getState();
  if (dailyDefense.date === today) return;

  const prev = dailyDefense;
  setDailyDefense(
    createEmptyDailyDefense({
      date: today,
      startHour: prev.startHour,
      attackedSection: prev.attackedSection,
      gameDayIndex: prev.gameDayIndex + 1,
    }),
  );
}

/** Fix persisted id pointing at a removed character; keep null for selection screen. */
function fixInvalidCurrentCharacter(): void {
  const { characters, currentCharacterId, setCurrentCharacterId } =
    useCharactersStore.getState();
  if (!currentCharacterId) return;
  if (characters[currentCharacterId]) return;
  const ids = Object.keys(characters);
  setCurrentCharacterId(ids[0] ?? null);
}

/** Older saves may omit `currentHexId` (defaults to home hex). */
function ensureCharacterCurrentHex(): void {
  const { characters, updateCharacter } = useCharactersStore.getState();
  for (const id of Object.keys(characters)) {
    const ch = characters[id];
    const hexId = ch.currentHexId ?? ch.homeHexId;
    if (ch.currentHexId !== hexId) {
      updateCharacter(id, { currentHexId: hexId });
    }
  }
}

/**
 * Rehydrate persisted slices, migrate meta, regen stamina, roll daily defense,
 * and fix stale `currentCharacterId`.
 */
export async function bootstrapGame(): Promise<void> {
  await rehydrateAllStores();
  runMetaMigration();
  const now = Date.now();
  applyStaminaRegenToAllCharacters(now);
  rollDailyDefenseIfNeeded(now);
  fixInvalidCurrentCharacter();
  ensureCharacterCurrentHex();
}
