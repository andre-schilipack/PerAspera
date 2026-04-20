import {
  CENTER_HEX_ID,
  DEFAULT_MAP_RADIUS,
  HOME_HEX_ID,
  NPC_OWNER_HISTORIAN,
  NPC_OWNER_MERCADO,
  NPC_OWNER_PARENTS_HOME,
  NPC_OWNER_PREFEITURA,
  NPC_OWNER_QUARTEL,
  PREFECTURE_STRUCTURE_MAX_HP,
} from '../constants.ts';
import {
  axialDistance,
  hexKeyFromAxial,
  listAxialInDisk,
  type AxialCoord,
} from '../hex.ts';
import { dangerIntegrityForRingDistance } from '../hexDangerIntegrity.ts';
import { makeSlotId } from '../ids.ts';
import type { Hex, HexMap, PlaceSlot } from '../types/index.ts';

const ORIGIN: AxialCoord = { q: 0, r: 0 };

export interface CreateInitialWorldParams {
  /** Axial grid radius (default {@link DEFAULT_MAP_RADIUS}). */
  radius?: number;
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

/** Downtown: Mercado Municipal, Prefeitura, Quartel General (NPC-only). */
function buildCenterSlots(params: {
  centerHexId: string;
  slotIdCounter: number;
}): { slots: PlaceSlot[]; nextSlotId: number } {
  let n = params.slotIdCounter;
  const nextId = () => makeSlotId(n++);

  const slots: PlaceSlot[] = [
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
      structureHp: {
        current: PREFECTURE_STRUCTURE_MAX_HP,
        max: PREFECTURE_STRUCTURE_MAX_HP,
      },
      priceToBuy: 0,
    },
    {
      id: nextId(),
      hexId: params.centerHexId,
      ownedBy: NPC_OWNER_QUARTEL,
      type: 'quartel',
      priceToBuy: 0,
    },
  ];

  return { slots, nextSlotId: n };
}

/** Home ring hex: parents' home (shared) + Velho Rabiscão (historian / Score List). */
function buildHomeSlots(params: {
  homeHexId: string;
  slotIdCounter: number;
}): { slots: PlaceSlot[]; nextSlotId: number } {
  let n = params.slotIdCounter;
  const nextId = () => makeSlotId(n++);

  const slots: PlaceSlot[] = [
    {
      id: nextId(),
      hexId: params.homeHexId,
      ownedBy: NPC_OWNER_PARENTS_HOME,
      type: 'home',
      priceToBuy: 0,
    },
    {
      id: nextId(),
      hexId: params.homeHexId,
      ownedBy: NPC_OWNER_HISTORIAN,
      type: 'historian',
      priceToBuy: 0,
    },
  ];

  return { slots, nextSlotId: n };
}

/**
 * Seeds a disk-shaped hex map: **Centro** holds municipal NPCs; **home hex** holds
 * the player's house and Velho Rabiscão. Ring 1 is explorable; outer rings start locked.
 */
export function createInitialWorld(
  params: CreateInitialWorldParams,
): CreateInitialWorldResult {
  const radius = params.radius ?? DEFAULT_MAP_RADIUS;
  const coords = listAxialInDisk(radius);
  const hexes: Record<string, Hex> = {};

  let slotCounter = params.slotIdCounter;

  const centerSlots = buildCenterSlots({
    centerHexId: CENTER_HEX_ID,
    slotIdCounter: slotCounter,
  });
  slotCounter = centerSlots.nextSlotId;

  const homeSlots = buildHomeSlots({
    homeHexId: HOME_HEX_ID,
    slotIdCounter: slotCounter,
  });
  slotCounter = homeSlots.nextSlotId;

  for (const c of coords) {
    const id = hexKeyFromAxial(c.q, c.r);
    const dist = axialDistance(c, ORIGIN);
    const { danger, integrity } = dangerIntegrityForRingDistance(dist);

    const isCenter = id === CENTER_HEX_ID;
    const isHome = id === HOME_HEX_ID;
    const isUnlocked = dist <= 1;

    let placeSlots: PlaceSlot[] = [];
    if (isCenter) placeSlots = centerSlots.slots;
    else if (isHome) placeSlots = homeSlots.slots;

    hexes[id] = {
      id,
      coordinates: { q: c.q, r: c.r },
      danger,
      integrity,
      placeSlots,
      isUnlocked,
    };
  }

  const widthLabel = radius * 2 + 1;

  return {
    hexMap: {
      size: widthLabel,
      hexes,
    },
    nextSlotId: slotCounter,
    nextBusinessId: params.businessIdCounter ?? 0,
  };
}
