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

export interface Hex {
  id: string;
  coordinates: { q: number; r: number };
  /** 0–100 district danger. */
  danger: number;
  /** 0–100 local integrity (district feel). */
  integrity: number;
  placeSlots: PlaceSlot[];
  isUnlocked: boolean;
}

export interface HexMap {
  /** Grid radius or half-size label used by factories (e.g. 5 or 7). */
  size: number;
  hexes: Record<string, Hex>;
}
