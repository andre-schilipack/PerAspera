import { DEFAULT_MAP_RADIUS, NPC_OWNER_MERCADO, NPC_OWNER_PREFEITURA } from '../constants.ts';
import {
  axialDistance,
  hexKeyFromAxial,
  listAxialInDisk,
  type AxialCoord,
} from '../hex.ts';
import { makeSlotId } from '../ids.ts';
import type { Hex, HexMap, PlaceSlot } from '../types/index.ts';

const ORIGIN: AxialCoord = { q: 0, r: 0 };

export interface CreateInitialWorldParams {
  /** Axial grid radius (default {@link DEFAULT_MAP_RADIUS}). */
  radius?: number;
  /** Owner id for the home slot (e.g. `char_1`). */
  characterId: string;
  /** First free slot counter; factory consumes sequential ids (`slot_1`, …). */
  slotIdCounter: number;
  /** Echoed back unchanged until world seed creates businesses. */
  businessIdCounter?: number;
}

export interface CreateInitialWorldResult {
  hexMap: HexMap;
  nextSlotId: number;
  /** Same as input if no business rows were created (seed uses none). */
  nextBusinessId: number;
}

function defaultDangerIntegrity(distanceFromCenter: number): {
  danger: number;
  integrity: number;
} {
  const danger = Math.min(100, 12 + distanceFromCenter * 8);
  const integrity = Math.max(40, 95 - distanceFromCenter * 5);
  return { danger, integrity };
}

function buildCenterSlots(params: {
  centerHexId: string;
  characterId: string;
  slotIdCounter: number;
}): { slots: PlaceSlot[]; nextSlotId: number } {
  let n = params.slotIdCounter;
  const nextId = () => makeSlotId(n++);

  const slots: PlaceSlot[] = [
    {
      id: nextId(),
      hexId: params.centerHexId,
      ownedBy: params.characterId,
      type: 'home',
      priceToBuy: 0,
    },
    {
      id: nextId(),
      hexId: params.centerHexId,
      ownedBy: NPC_OWNER_MERCADO,
      type: 'market',
      priceToBuy: 0,
    },
    {
      id: nextId(),
      hexId: params.centerHexId,
      ownedBy: NPC_OWNER_PREFEITURA,
      type: 'prefeitura',
      priceToBuy: 0,
    },
  ];

  return { slots, nextSlotId: n };
}

/**
 * Seeds a disk-shaped hex map: center tile holds home + municipal market + city hall.
 * Ring 1 is explorable; outer rings start locked (MVP progression hook).
 */
export function createInitialWorld(
  params: CreateInitialWorldParams,
): CreateInitialWorldResult {
  const radius = params.radius ?? DEFAULT_MAP_RADIUS;
  const coords = listAxialInDisk(radius);
  const hexes: Record<string, Hex> = {};

  const centerHexId = hexKeyFromAxial(0, 0);
  const { slots: centerSlots, nextSlotId } = buildCenterSlots({
    centerHexId,
    characterId: params.characterId,
    slotIdCounter: params.slotIdCounter,
  });

  for (const c of coords) {
    const id = hexKeyFromAxial(c.q, c.r);
    const dist = axialDistance(c, ORIGIN);
    const { danger, integrity } = defaultDangerIntegrity(dist);

    const isCenter = c.q === 0 && c.r === 0;
    const isUnlocked = dist <= 1;

    hexes[id] = {
      id,
      coordinates: { q: c.q, r: c.r },
      danger,
      integrity,
      placeSlots: isCenter ? centerSlots : [],
      isUnlocked,
    };
  }

  const widthLabel = radius * 2 + 1;

  return {
    hexMap: {
      size: widthLabel,
      hexes,
    },
    nextSlotId,
    nextBusinessId: params.businessIdCounter ?? 0,
  };
}
