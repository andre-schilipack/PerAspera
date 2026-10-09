import {
  CENTER_HEX_ID,
  DEFAULT_MAP_RADIUS,
  FOUNDERS_COAL_STOCK,
  HOME_HEX_ID,
  NPC_OWNER_HISTORIAN,
  NPC_OWNER_MERCADO,
  NPC_OWNER_PARENTS_HOME,
  NPC_OWNER_PREFEITURA,
  NPC_OWNER_QUARTEL,
  PREFECTURE_STRUCTURE_MAX_HP,
  PUBLIC_WORK_TAX_DEFAULT,
} from '../constants.ts';
import {
  axialDistance,
  hexKeyFromAxial,
  listAxialInDisk,
  type AxialCoord,
} from '../hex.ts';
import { dangerIntegrityForRingDistance } from '../hexDangerIntegrity.ts';
import { makeSlotId } from '../ids.ts';
import { depositIntoBusinessSlots } from '../businessInventorySlots.ts';
import { createNewBusiness } from './createBusiness.ts';
import type { HexMap, HexTile, PlaceSlot } from '../types/index.ts';

const FOUNDERS_HEX_ID = '0,1';
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

/** Prefeitura farm (public, fully staffed) and thermoelectric plant (not public). */
function buildFoundersIndustry(params: {
  hexId: string;
  slotIdCounter: number;
}): { slots: PlaceSlot[]; nextSlotId: number } {
  let n = params.slotIdCounter;
  const nextId = () => makeSlotId(n++);
  const farm = createNewBusiness({
    id: 'biz_founders_farm',
    buildingId: 'fazenda',
    nowMs: 0,
    workersAssigned: 2,
    isPublic: true,
    publicWorkTax: PUBLIC_WORK_TAX_DEFAULT,
  });
  let plant = createNewBusiness({
    id: 'biz_founders_plant',
    buildingId: 'termoeletrica',
    nowMs: 0,
    workersAssigned: 2,
    isPublic: false,
  });
  plant = {
    ...plant,
    inventorySlots: depositIntoBusinessSlots(
      plant.inventorySlots,
      'coal',
      FOUNDERS_COAL_STOCK,
    ).slots,
  };
  const slots: PlaceSlot[] = [
    {
      id: nextId(),
      hexId: params.hexId,
      ownedBy: NPC_OWNER_PREFEITURA,
      type: 'business',
      business: farm,
      priceToBuy: 0,
    },
    {
      id: nextId(),
      hexId: params.hexId,
      ownedBy: NPC_OWNER_PREFEITURA,
      type: 'business',
      business: plant,
      priceToBuy: 0,
    },
  ];
  return { slots, nextSlotId: n };
}

/**
 * Seeds a disk-shaped hex map: **Centro** holds municipal NPCs; **home hex** holds
 * the player's house and Velho Rabiscão. Ring 1 is explorable; outer rings start locked.
 * Hex 0,1 holds the founders' farm and thermoelectric plant.
 */
export function createInitialWorld(
  params: CreateInitialWorldParams,
): CreateInitialWorldResult {
  const radius = params.radius ?? DEFAULT_MAP_RADIUS;
  const coords = listAxialInDisk(radius);
  const hexes: Record<string, HexTile> = {};

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

  const founders = buildFoundersIndustry({
    hexId: FOUNDERS_HEX_ID,
    slotIdCounter: slotCounter,
  });
  slotCounter = founders.nextSlotId;

  for (const c of coords) {
    const id = hexKeyFromAxial(c.q, c.r);
    const dist = axialDistance(c, ORIGIN);
    const { danger, integrity } = dangerIntegrityForRingDistance(dist);

    const isCenter = id === CENTER_HEX_ID;
    const isHome = id === HOME_HEX_ID;
    const isFounders = id === FOUNDERS_HEX_ID;
    const isUnlocked = dist <= 1;

    let placeSlots: PlaceSlot[] = [];
    if (isCenter) placeSlots = centerSlots.slots;
    else if (isHome) placeSlots = homeSlots.slots;
    else if (isFounders) placeSlots = founders.slots;

    const baseTile: HexTile = {
      id,
      coordinates: { q: c.q, r: c.r },
      danger,
      integrity,
      placeSlots,
      isUnlocked,
    };

    hexes[id] =
      isCenter
        ? {
            ...baseTile,
            features: [
              {
                type: 'city_hall',
                currentHp: PREFECTURE_STRUCTURE_MAX_HP,
                maxHp: PREFECTURE_STRUCTURE_MAX_HP,
              },
            ],
          }
        : baseTile;
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
