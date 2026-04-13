import { formatLocalDateString } from '../domain/defenseSchedule.ts';
import {
  composeWaveFromBudget,
  sumLivingThreatPoints,
  targetThreatBudget,
} from '../domain/enemyThreat.ts';
import { rollDailyDefenseStateForNewDay } from '../domain/factories/createDefenseSeed.ts';
import { migrateGameMetaState } from '../domain/migrations.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { applyStaminaRegenToAllCharacters } from './staminaRegenTick.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';
import { PLAYER_BASE_MAX_HP } from '../domain/constants.ts';
import { runEconomicCatchUp } from './economicCatchUp.ts';
import type { DailyDefenseState, GameMetaState } from '../domain/types/index.ts';

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
    useCityStore.persist.rehydrate(),
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
    rollDailyDefenseStateForNewDay({
      date: today,
      gameDayIndex: prev.gameDayIndex + 1,
      startHour: prev.startHour,
      rng: Math.random,
    }),
  );
}

/** Old saves may omit nightly defense fields; fill defaults without wiping progress. */
function ensureDailyDefenseShape(): void {
  const { dailyDefense, patchDailyDefense } = useDefenseStore.getState();
  const d = dailyDefense as unknown as Record<string, unknown>;
  let needsPatch = false;
  const patch: Record<string, unknown> = {};
  if (d.enlistedForDate === undefined) {
    patch.enlistedForDate = {};
    needsPatch = true;
  }
  if (d.phase === undefined) {
    patch.phase = 'idle';
    needsPatch = true;
  }
  if (d.outcome === undefined) {
    patch.outcome = 'active';
    needsPatch = true;
  }
  if (d.defenderLine === undefined) {
    patch.defenderLine = [];
    needsPatch = true;
  }
  if (needsPatch) {
    patchDailyDefense(patch as Partial<DailyDefenseState>);
  }
}

/**
 * Persisted saves from before seeded waves: if no enemies for current idle day, seed once.
 */
function seedNightlyWaveIfEmpty(now: number): void {
  const today = formatLocalDateString(new Date(now));
  const { dailyDefense, patchDailyDefense } = useDefenseStore.getState();
  if (dailyDefense.date !== today) return;
  if (dailyDefense.enemies.length > 0) return;
  if (dailyDefense.isCompleted) return;
  const rng = Math.random;
  const budget = targetThreatBudget(dailyDefense.gameDayIndex);
  const enemies = composeWaveFromBudget(budget, rng);
  patchDailyDefense({
    enemies,
    totalEnemyPoints: sumLivingThreatPoints(enemies),
  });
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

/** Older saves without `health` — default to full HP. */
function ensureCharacterHealth(): void {
  const { characters, updateCharacter } = useCharactersStore.getState();
  for (const id of Object.keys(characters)) {
    const ch = characters[id];
    if (ch.health != null && ch.health.max > 0) continue;
    updateCharacter(id, {
      health: {
        current: PLAYER_BASE_MAX_HP,
        max: PLAYER_BASE_MAX_HP,
      },
    });
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
  ensureDailyDefenseShape();
  seedNightlyWaveIfEmpty(now);
  fixInvalidCurrentCharacter();
  ensureCharacterCurrentHex();
  ensureCharacterHealth();
  runEconomicCatchUp(now);
}
