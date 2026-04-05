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

/** STA spent to lock participation in nightly defense. */
export const DEFENSE_LOCK_STA_COST = 50;

/** Passive stamina regenerated over a full 24h window (offline-friendly). */
export const STAMINA_REGEN_PER_24H = 120;

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

/** Starting city credits for a new character (Alpha balance). */
export const STARTING_CREDS = 50;
