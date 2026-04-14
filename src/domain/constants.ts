/**
 * Core game balance constants for Alpha 0.1 (Robusto).
 * Tune here before scattering magic numbers across stores.
 */

/** App semver string mirrored in save metadata (human-readable). */
export const GAME_VERSION = '0.1.0' as const;

/** Monotonic integer for persisted data migrations only. */
export const SCHEMA_VERSION = 2;

/** Economic simulation: one tick every 30 minutes of real time (48 ticks / 24h). */
export const ECONOMIC_TICK_INTERVAL_MS = 30 * 60 * 1000;

/** Cap offline catch-up to avoid clock abuse (14 days of ticks). */
export const MAX_ECONOMIC_CATCH_UP_TICKS = 48 * 14;

/** Structural damage to wall section when a defense wave was cleared (legacy demo; prefer enemy wall strikes). */
export const DEFENSE_WALL_WEAR_ON_WAVE_CLEARED = 12.4;

/** Nightly defense: tower + guards only deal damage (no incoming HP). */
export const DEFENSE_NPC_TOWER_ID = 'npc_auto_tower' as const;
export const DEFENSE_NPC_TOWER_LABEL = 'Auto tower';
export const DEFENSE_NPC_GUARD_IDS = [
  'npc_guard_rifle_a',
  'npc_guard_rifle_b',
] as const;
export const DEFENSE_TOWER_DAMAGE_MIN = 8;
export const DEFENSE_TOWER_DAMAGE_MAX = 14;
export const DEFENSE_GUARD_DAMAGE_MIN = 5;
export const DEFENSE_GUARD_DAMAGE_MAX = 10;
export const DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN = 4;
export const DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX = 10;
export const DEFENSE_ENEMY_STRIKE_VS_WALL_MIN = 6;
export const DEFENSE_ENEMY_STRIKE_VS_WALL_MAX = 12;
/** Retreat from front line at or below this fraction of max session HP. */
export const DEFENSE_RETREAT_HP_FRACTION = 0.5;

/** Raid: civilians lost per remaining threat point after breach. */
export const RAID_CIVILIANS_PER_THREAT_POINT = 40;
/** Raid: threat points consumed per destroyed business slot. */
export const RAID_THREAT_PER_BUSINESS = 3;

/** Integrity points restored per repair action. */
export const WALL_REPAIR_INTEGRITY_PER_ACTION = 25;

/** Creds cost per repair action (paid by active character). */
export const WALL_REPAIR_CREDS_COST = 40;

/** Economic ticks per simulated wage day (24h real at 30 min/tick). */
export const ECONOMIC_TICKS_PER_WAGE_DAY = 48;

/** Civilians required to add one worker to the global pool (floor division). */
export const CIVILIANS_PER_WORKER_POOL_SLOT = 1000;

/** Starting population for new saves (MVP: static growth comes later). */
export const INITIAL_CIVILIAN_POPULATION = 12_000;

/** Placeholder creds/day from simulated shop sales per assigned worker (loja). */
export const SHOP_SIMULATED_CREDS_PER_DAY_PER_WORKER = 24;

/** Default max workers per business slot. */
export const DEFAULT_WORKER_SLOTS = 2;

export const DEFAULT_WAGE_PER_DAY = 8;

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

/** Default max (and starting) HP for playable characters and street skirmish pool. */
export const PLAYER_BASE_MAX_HP = 42;

/** @deprecated Use {@link PLAYER_BASE_MAX_HP}. */
export const STREET_SKIRMISH_PLAYER_HP = PLAYER_BASE_MAX_HP;

/** Score granted when you clear a street encounter (no creds from enemies). */
export const STREET_SKIRMISH_WIN_SCORE = 4;

/** Scrap metal units granted on street skirmish win (enemies do not drop creds). */
export const STREET_SKIRMISH_SCRAP_REWARD_QTY = 2;

/** Base dodge chance (0–1) for melee resolution. */
export const BASE_MELEE_DODGE_CHANCE = 0.1;

/** Base block chance (0–1), rolled only if not dodged. */
export const BASE_MELEE_BLOCK_CHANCE = 0.1;

/** Damage multiplier when a hit is blocked (mitigated). */
export const BLOCK_DAMAGE_FACTOR = 0.5;

/** STA spent to lock participation in nightly defense. */
export const DEFENSE_LOCK_STA_COST = 50;

/** Per participant on nightly defense victory (leaderboard / meta). */
export const DEFENSE_VICTORY_SCORE = 25;

/** Reputation (fame) granted to each enlisted participant on victory. */
export const DEFENSE_VICTORY_REPUTATION = 20;

/** Creds granted to each enlisted participant on victory. */
export const DEFENSE_VICTORY_CREDS = 50;

/** STA spent to work / accelerate a business (daily tick). */
export const WORK_STA_COST = 5;

/** Quartel "Expansão de fronteira" contract: slots and enlist cost. */
export const EXPANSION_CONTRACT_CHAR_SLOTS = 2;
export const EXPANSION_CONTRACT_STA_COST = 20;

/** Passive stamina regenerated over a full 24h window (offline-friendly). */
export const STAMINA_REGEN_PER_24H = 120;

/** Passive HP regenerated over a full 24h window (same clock as stamina regen). */
export const HEALTH_REGEN_PER_24H = 48;

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

/** Contract id prefix (e.g. contract_1). */
export const ID_PREFIX_CONTRACT = 'contract';

/** NPC owner keys for fixed city tiles (not character ids). */
export const NPC_OWNER_MERCADO = 'npc:mercado_municipal' as const;
export const NPC_OWNER_PREFEITURA = 'npc:prefeitura' as const;
export const NPC_OWNER_QUARTEL = 'npc:quartel_general' as const;
export const NPC_OWNER_HISTORIAN = 'npc:velho_rabiscao' as const;

/** Shared parents' home tile on {@link HOME_HEX_ID} (all characters start here). */
export const NPC_OWNER_PARENTS_HOME = 'npc:parents_home' as const;

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
