export type {
  Character,
  CharacterHealth,
  CombatLoadout,
  StaminaState,
} from './character.ts';
export type { CoreAttributeKey, CoreAttributes } from './attributes.ts';
export type {
  CombatBeatPhase,
  CombatLogActor,
  CombatLogEntry,
  DefenseParticipant,
  DefenseParticipantKind,
  DefenseTacticalBucket,
  DefenseSide,
  Enemy,
  EnemyInstance,
  MoveDamageKind,
  MoveEffect,
  MovePower,
  MoveTag,
  MoveTargetScope,
  MoveTemplate,
  MoveTemplateId,
} from './combat.ts';
export type {
  Business,
  BusinessInventorySlot,
  PassiveItemBuffer,
} from './economy.ts';
export type {
  DailyDefenseState,
  DefenseCatchUpNightRow,
  DefenseEndScreenState,
  DefenseVictoryParticipantSummary,
  DefenderCombatState,
  DefenderLineEntry,
  NightlyDefenseOutcome,
  NightlyDefensePhase,
} from './defense.ts';
export type {
  AlliedStructure,
  AlliedStructureCityHall,
  AlliedStructureType,
  AlliedStructureWall,
  EncounterSessionConfig,
} from './encounter.ts';
export type { Item, ItemRarity, ItemType } from './items.ts';
export type {
  HexMap,
  HexTile,
  HexTileCityHallFeature,
  HexTileFeature,
  HexTileWallFeature,
  PlaceSlot,
  PlaceSlotType,
} from './map.ts';
export type { Contract, ContractStatus, ContractType } from './contracts.ts';
export type {
  GameMetaState,
  GameOverReason,
  HallOfFameEntry,
  NextIdCounters,
} from './meta.ts';
export type { ScoreEntry } from './score.ts';
export type { CityCoreState } from './city.ts';
export type {
  CombatStrikeTargetKind,
  MassCombatModeFlags,
  MassCombatRoundConfig,
  MassCombatRoundResultBase,
  MassCombatStructuralPresence,
  MassCombatWallSnapshot,
} from './massCombat.ts';
export {
  massCombatActiveStrikeTargets,
  massCombatModeFlagsNightlyWall,
  massCombatModeFlagsPrefeituraSiege,
  massCombatStructuralPresent,
  massCombatStructuralPresenceNightlyWall,
  massCombatStructuralPresencePrefeituraSiege,
} from './massCombat.ts';
export type {
  StreetSkirmishOutcome,
  StreetSkirmishSession,
} from './skirmish.ts';
