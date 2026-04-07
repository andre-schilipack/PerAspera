/**
 * Core game balance constants for Alpha 0.1 (Robusto).
 * Tune here before scattering magic numbers across stores.
 */

/** App semver string mirrored in save metadata (human-readable). */
export const GAME_VERSION = '0.1.0' as const;

/** Monotonic integer for persisted data migrations only. */
export const SCHEMA_VERSION = 1;

/** Stamina at character creation (before level-based max upgrades). */
export const STAMINA_INITIAL = 200;

/** Default max stamina at level 1 (can scale with level later). */
export const STAMINA_MAX_BASE = 240;

/** STA spent per hex move (patrol / travel). */
export const PATROL_STA_COST = 1;

/**
 * Street encounter roll after moving to a neighbor hex (independent of skirmish UI).
 * Final chance = min(CAP, BASE + (danger/100) * WEIGHT).
 */
export const PATROL_ENCOUNTER_BASE_CHANCE = 0.06;

/** Extra chance at danger 100 (before cap). */
export const PATROL_ENCOUNTER_DANGER_WEIGHT = 0.34;

/** Maximum encounter chance per patrol step (avoid frustration). */
export const PATROL_ENCOUNTER_CHANCE_CAP = 0.42;

/** Player HP pool during a street skirmish (Alpha). */
export const STREET_SKIRMISH_PLAYER_HP = 42;

/** Creds granted when you clear a street encounter. */
export const STREET_SKIRMISH_WIN_CREDS = 8;

/** Defense-score style contribution for local board (small). */
export const STREET_SKIRMISH_WIN_SCORE = 4;

/** STA spent to lock participation in nightly defense. */
export const DEFENSE_LOCK_STA_COST = 50;

/** STA spent to work / accelerate a business (daily tick). */
export const WORK_STA_COST = 5;

/** Passive stamina regenerated over a full 24h window (offline-friendly). */
export const STAMINA_REGEN_PER_24H = 120;

/** Reapply regen logic on this interval while the game UI is open (real-time updates). */
export const STAMINA_REGEN_UI_INTERVAL_MS = 10_000;

/** Local hour (0–23) when nightly defense may start. */
export const DEFENSE_START_HOUR = 20;

/** Milliseconds in one day (calendar math uses local dates elsewhere). */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default hex grid radius (axial); e.g. 2 => 5x5-ish cluster. */
export const DEFAULT_MAP_RADIUS = 2;

/** Character id prefix + numeric counter (e.g. char_1). */
export const ID_PREFIX_CHARACTER = 'char';

/** Combat log line id prefix for display / factories (counter in meta). */
export const ID_PREFIX_COMBAT_LOG = 'clog';

/** Business id prefix. */
export const ID_PREFIX_BUSINESS = 'biz';

/** Place slot id prefix. */
export const ID_PREFIX_SLOT = 'slot';

/** NPC owner keys for fixed city tiles (not character ids). */
export const NPC_OWNER_MERCADO = 'npc:mercado_municipal' as const;
export const NPC_OWNER_PREFEITURA = 'npc:prefeitura' as const;
export const NPC_OWNER_QUARTEL = 'npc:quartel_general' as const;
export const NPC_OWNER_HISTORIAN = 'npc:velho_rabiscao' as const;

/** City-owned empty lots before a character purchases. */
export const NPC_OWNER_CITY = 'npc:city' as const;

/**
 * Axial key for the downtown tile: market, prefeitura, quartel (NPC services).
 */
export const CENTER_HEX_ID = '0,0' as const;

/**
 * Axial key for the starter home hex (parents' house + Velho Rabiscão).
 * Ring-1 neighbor of {@link CENTER_HEX_ID}.
 */
export const HOME_HEX_ID = '1,0' as const;

/** Default price for an empty peripheral lot (creds). */
export const EMPTY_LOT_PRICE = 100;

/** Starting city credits for a new character (Alpha balance). */
export const STARTING_CREDS = 50;
