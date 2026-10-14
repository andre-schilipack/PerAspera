import type { Business } from './economy.ts';

export type PlaceSlotType =
  | 'empty'
  | 'home'
  | 'business'
  | 'ruin'
  | 'market'
  | 'prefeitura'
  | 'quartel'
  | 'historian'
  | 'other';

export interface PlaceSlot {
  id: string;
  hexId: string;
  /** Character id (e.g. char_1) or npc key such as `npc:mercado_municipal`. */
  ownedBy: string;
  type: PlaceSlotType;
  business?: Business;
  /** Structural integrity for raids / siege (business & prefeitura). */
  structureHp?: { current: number; max: number };
  priceToBuy: number;
}

export interface HexTileWallFeature {
  type: 'wall';
  currentHp: number;
  maxHp: number;
}

export interface HexTileCityHallFeature {
  type: 'city_hall';
  currentHp: number;
  maxHp: number;
}

/** Revealed robot nest (main-quest intel). Present only after discovery. */
export interface HexTileRobotNestFeature {
  type: 'robot_nest';
}

export type HexTileFeature =
  | HexTileWallFeature
  | HexTileCityHallFeature
  | HexTileRobotNestFeature;

export interface HexTile {
  id: string;
  coordinates: { q: number; r: number };
  /** 0–100 district danger. */
  danger: number;
  /** 0–100 local integrity (district feel). */
  integrity: number;
  placeSlots: PlaceSlot[];
  isUnlocked: boolean;
  /** Discriminated structural / civic features persisted on the tile. */
  features?: readonly HexTileFeature[];
}

export interface HexMap {
  /** Grid radius or half-size label used by factories (e.g. 5 or 7). */
  size: number;
  hexes: Record<string, HexTile>;
  /**
   * Hidden nest hex id (axial key). Chosen at new game; tile may not exist until
   * frontier expansion charts ring 3.
   */
  nestHexId?: string;
  /** True after the nest hex was unlocked via expansion (Act 1 once). */
  enemyNestDiscovered?: boolean;
}
