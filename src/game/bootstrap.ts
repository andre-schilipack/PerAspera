import { formatLocalDateString } from '../domain/defenseSchedule.ts';
import {
  composeWaveFromBudget,
  sumLivingThreatPoints,
  targetThreatBudget,
} from '../domain/enemyThreat.ts';
import { rollVictoryLootPoolForWave } from '../domain/nightlyDefenseLoot.ts';
import { migrateGameMetaState } from '../domain/migrations.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { applyHealthRegenToAllCharacters } from './healthRegenTick.ts';
import { applyStaminaRegenToAllCharacters } from './staminaRegenTick.ts';
import { runNightlyDefenseCatchUp } from './nightlyDefenseCatchUp.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';
import {
  ALLY_SPIRIT_INITIAL,
  CENTER_HEX_ID,
  DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
  HOME_HEX_ID,
  PLAYER_BASE_MAX_HP,
  PREFECTURE_STRUCTURE_MAX_HP,
} from '../domain/constants.ts';
import {
  aggregateLegacyWallToPool,
  ensureCityHallFeatureOnTile,
  ensureWallFeatureOnTile,
  findCityHallFeature,
  patchHexInMap,
  upsertWallFeatureHp,
} from '../domain/encounterCombatWall.ts';
import {
  defenderBucketForLineIndex,
  enemyBucketForSpawnIndex,
} from '../domain/defenseTactics.ts';
import { runEconomicCatchUp } from './economicCatchUp.ts';
import type { DailyDefenseState, GameMetaState } from '../domain/types/index.ts';

function pickMetaSnapshot(state: ReturnType<typeof useMetaStore.getState>): GameMetaState {
  return {
    version: state.version,
    schemaVersion: state.schemaVersion,
    createdAt: state.createdAt,
    globalScoreboard: state.globalScoreboard,
    hallOfFame: state.hallOfFame ?? [],
    nextIds: state.nextIds,
    gameOver: state.gameOver ?? false,
    gameOverReason: state.gameOverReason ?? null,
    gameOverAt: state.gameOverAt ?? null,
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
  if (d.victoryLootPool === undefined) {
    patch.victoryLootPool = [];
    needsPatch = true;
  }
  if (d.targetHexId === undefined || typeof d.targetHexId !== 'string') {
    patch.targetHexId = HOME_HEX_ID;
    needsPatch = true;
  }
  if (typeof d.allySpirit !== 'number') {
    patch.allySpirit = ALLY_SPIRIT_INITIAL;
    needsPatch = true;
  }
  if (typeof d.moraleShockTurnsRemaining !== 'number') {
    patch.moraleShockTurnsRemaining = 0;
    needsPatch = true;
  }

  const rawEnemies = d.enemies;
  if (Array.isArray(rawEnemies)) {
    let migEnemy = false;
    const enemies = rawEnemies.map(
      (e: Record<string, unknown>, i: number) => {
        const curHp = Number(e.currentHealth);
        const row = { ...e };
        if (typeof row.tacticalBucket !== 'string') {
          migEnemy = true;
          row.tacticalBucket = enemyBucketForSpawnIndex(i);
        }
        if (typeof row.maxHealth !== 'number') {
          migEnemy = true;
          row.maxHealth = Math.max(
            Number.isFinite(curHp) ? curHp : 1,
            1,
          );
        }
        return row;
      },
    );
    if (migEnemy) {
      patch.enemies = enemies;
      needsPatch = true;
    }
  }

  const rawLine = d.defenderLine;
  if (Array.isArray(rawLine)) {
    let migLine = false;
    const defenderLine = rawLine.map(
      (entry: Record<string, unknown>, i: number) => {
        const row = { ...entry };
        if (typeof row.tacticalBucket !== 'string') {
          migLine = true;
          row.tacticalBucket = defenderBucketForLineIndex(i);
        }
        return row;
      },
    );
    if (migLine) {
      patch.defenderLine = defenderLine;
      needsPatch = true;
    }
  }

  if (needsPatch) {
    patchDailyDefense(patch as Partial<DailyDefenseState>);
  }
}

/** Older saves omit structural HP used by raid march / Prefeitura siege. */
function ensureHexMapStructureDefaults(): void {
  const hexMap = useWorldStore.getState().hexMap;
  if (!hexMap) return;

  let changed = false;
  const hexes = { ...hexMap.hexes };

  for (const hid of Object.keys(hexes)) {
    const hex = hexes[hid]!;
    const placeSlots = hex.placeSlots.map((slot) => {
      if (slot.type === 'business' && slot.business && slot.structureHp === undefined) {
        changed = true;
        return {
          ...slot,
          structureHp: {
            current: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
            max: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
          },
        };
      }
      if (slot.type === 'prefeitura' && slot.structureHp === undefined) {
        changed = true;
        return {
          ...slot,
          structureHp: {
            current: PREFECTURE_STRUCTURE_MAX_HP,
            max: PREFECTURE_STRUCTURE_MAX_HP,
          },
        };
      }
      return slot;
    });
    hexes[hid] = { ...hex, placeSlots };
  }

  if (changed) {
    useWorldStore.getState().setHexMap({ ...hexMap, hexes });
  }
}

/** Older saves: add `city_hall` feature on Centro from Prefeitura slot HP. */
function ensureCityHallFeatureFromPrefeituraSlot(): void {
  const hexMap = useWorldStore.getState().hexMap;
  if (!hexMap) return;
  const center = hexMap.hexes[CENTER_HEX_ID];
  if (!center) return;
  if (findCityHallFeature(center.features)) return;
  const pref = center.placeSlots.find((s) => s.type === 'prefeitura');
  const max = pref?.structureHp?.max ?? PREFECTURE_STRUCTURE_MAX_HP;
  const cur = pref?.structureHp?.current ?? max;
  useWorldStore.getState().setHexMap(
    patchHexInMap(hexMap, CENTER_HEX_ID, (t) =>
      ensureCityHallFeatureOnTile(t, cur, max),
    ),
  );
}

/** Ensure the nightly raid anchor hex carries a single `wall` feature pool. */
function ensureDefenseWallFeatureOnTargetHex(): void {
  const hexMap = useWorldStore.getState().hexMap;
  const daily = useDefenseStore.getState().dailyDefense;
  if (!hexMap) return;
  const id = daily.targetHexId;
  const tile = hexMap.hexes[id];
  if (!tile) return;
  const next = ensureWallFeatureOnTile(tile);
  if (next !== tile) {
    useWorldStore.getState().setHexMap(patchHexInMap(hexMap, id, () => next));
  }
}

/**
 * One-shot: legacy `peraspera-defense` stored `wall` as four sections — fold into the
 * target hex tile pool and drop the key from storage so Zustand stops rehydrating it.
 */
function migrateLegacyDefenseWallIntoHexMap(): void {
  try {
    const raw = localStorage.getItem('peraspera-defense');
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      state?: {
        wall?: { sections: Record<string, { current: number; max: number }> };
        dailyDefense?: { targetHexId?: string };
      };
    };
    const wall = parsed.state?.wall;
    if (!wall?.sections) return;
    const hexMap = useWorldStore.getState().hexMap;
    if (!hexMap) return;
    const targetId =
      typeof parsed.state?.dailyDefense?.targetHexId === 'string'
        ? parsed.state.dailyDefense.targetHexId
        : HOME_HEX_ID;
    const { currentHp, maxHp } = aggregateLegacyWallToPool(wall);
    useWorldStore.getState().setHexMap(
      patchHexInMap(hexMap, targetId, (t) => upsertWallFeatureHp(t, currentHp, maxHp)),
    );
    delete parsed.state!.wall;
    localStorage.setItem('peraspera-defense', JSON.stringify(parsed));
  } catch {
    /* ignore corrupt localStorage */
  }
}

function stripLegacyAttackedSectionFromDailyDefense(): void {
  const daily = useDefenseStore.getState().dailyDefense as unknown as Record<
    string,
    unknown
  >;
  if (!('attackedSection' in daily)) return;
  const { attackedSection: _removed, ...rest } = daily;
  useDefenseStore
    .getState()
    .setDailyDefense(rest as import('../domain/types/index.ts').DailyDefenseState);
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
  const victoryLootPool = rollVictoryLootPoolForWave(
    enemies,
    rng,
    `seed_${today}`,
  );
  patchDailyDefense({
    enemies,
    totalEnemyPoints: sumLivingThreatPoints(enemies),
    victoryLootPool,
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

/** Older saves omit `autoEnlistNightlyDefense`; default ON (opt-out in UI). */
function ensureCharacterAutoEnlist(): void {
  const { characters, updateCharacter } = useCharactersStore.getState();
  for (const id of Object.keys(characters)) {
    const ch = characters[id]!;
    if (ch.autoEnlistNightlyDefense !== undefined) continue;
    updateCharacter(id, { autoEnlistNightlyDefense: true });
  }
}

/** Older saves without `health` or without `health.lastUpdated`. */
function ensureCharacterHealth(): void {
  const { characters, updateCharacter } = useCharactersStore.getState();
  const now = Date.now();
  for (const id of Object.keys(characters)) {
    const ch = characters[id];
    if (ch.health == null || ch.health.max <= 0) {
      updateCharacter(id, {
        health: {
          current: PLAYER_BASE_MAX_HP,
          max: PLAYER_BASE_MAX_HP,
          lastUpdated: now,
        },
      });
      continue;
    }
    if (ch.health.lastUpdated == null) {
      updateCharacter(id, {
        health: { ...ch.health, lastUpdated: now },
      });
    }
  }
}

/**
 * Rehydrate persisted slices, migrate meta, multi-day defense catch-up (before economy),
 * tail regen to `now`, then economic catch-up.
 */
export async function bootstrapGame(): Promise<void> {
  await rehydrateAllStores();
  runMetaMigration();
  const now = Date.now();
  if (useMetaStore.getState().gameOver) {
    fixInvalidCurrentCharacter();
    ensureCharacterCurrentHex();
    ensureCharacterAutoEnlist();
    ensureCharacterHealth();
    return;
  }

  ensureDailyDefenseShape();
  stripLegacyAttackedSectionFromDailyDefense();
  ensureHexMapStructureDefaults();
  ensureCityHallFeatureFromPrefeituraSlot();
  migrateLegacyDefenseWallIntoHexMap();
  ensureDefenseWallFeatureOnTargetHex();
  fixInvalidCurrentCharacter();
  ensureCharacterCurrentHex();
  ensureCharacterAutoEnlist();
  ensureCharacterHealth();

  const catchUp = runNightlyDefenseCatchUp(now);
  if (catchUp.nightSummaries.length > 0) {
    useDefenseStore.getState().openDefenseCatchUpSummary({
      nightSummaries: catchUp.nightSummaries,
      nightsProcessed: catchUp.nightsProcessed,
      abortedOnGameOver: catchUp.abortedOnGameOver,
    });
  }

  if (useMetaStore.getState().gameOver) {
    fixInvalidCurrentCharacter();
    ensureCharacterCurrentHex();
    ensureCharacterAutoEnlist();
    ensureCharacterHealth();
    return;
  }

  applyStaminaRegenToAllCharacters(now);
  applyHealthRegenToAllCharacters(now);

  seedNightlyWaveIfEmpty(now);
  fixInvalidCurrentCharacter();
  ensureCharacterCurrentHex();
  ensureCharacterAutoEnlist();
  ensureCharacterHealth();
  runEconomicCatchUp(now);
}
