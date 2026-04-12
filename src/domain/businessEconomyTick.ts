import {
  CIVILIANS_PER_WORKER_POOL_SLOT,
  ECONOMIC_TICKS_PER_WAGE_DAY,
  SHOP_SIMULATED_CREDS_PER_DAY_PER_WORKER,
  DEFAULT_WAGE_PER_DAY,
  DEFAULT_WORKER_SLOTS,
} from './constants.ts';
import type { Business, BusinessKind, PassiveItemBuffer } from './types/economy.ts';
import type { Character } from './types/character.ts';
import type { HexMap } from './types/map.ts';

/** Normalize persisted businesses from older saves. */
export function normalizeBusiness(b: Business): Business {
  const legacyWorkers = (b as unknown as { workers?: number }).workers;
  return {
    ...b,
    workerSlots: b.workerSlots ?? DEFAULT_WORKER_SLOTS,
    workersAssigned: b.workersAssigned ?? legacyWorkers ?? 0,
    wagePerDay: b.wagePerDay ?? DEFAULT_WAGE_PER_DAY,
    passiveItemBuffer: b.passiveItemBuffer ?? {},
    credsPending: b.credsPending ?? 0,
  };
}

export function passiveItemTemplateForKind(kind: BusinessKind): string | null {
  switch (kind) {
    case 'fazenda':
      return 'food_ration';
    case 'industria':
    case 'outro':
      return 'scrap_metal';
    case 'loja':
      return null;
    default:
      return null;
  }
}

export function isProductionBusinessKind(kind: BusinessKind): boolean {
  return kind !== 'loja';
}

export function totalAssignedWorkersAcrossMap(hexMap: HexMap): number {
  let n = 0;
  for (const hex of Object.values(hexMap.hexes)) {
    for (const slot of hex.placeSlots) {
      if (slot.type === 'business' && slot.business) {
        n += normalizeBusiness(slot.business).workersAssigned;
      }
    }
  }
  return n;
}

export function workerPoolAvailable(
  civilianPopulation: number,
  assignedTotal: number,
): number {
  const cap = Math.floor(
    Math.max(0, civilianPopulation) / CIVILIANS_PER_WORKER_POOL_SLOT,
  );
  return Math.max(0, cap - assignedTotal);
}

function addToBuffer(
  buf: PassiveItemBuffer,
  templateId: string,
  delta: number,
): PassiveItemBuffer {
  if (delta <= 0) return buf;
  return { ...buf, [templateId]: (buf[templateId] ?? 0) + delta };
}

/**
 * One economic tick of passive production / simulated shop sales into buffers.
 */
export function applyPassiveBuffersOneTick(hexMap: HexMap): HexMap {
  const hexes = { ...hexMap.hexes };
  for (const hexId of Object.keys(hexes)) {
    const hex = hexes[hexId];
    let changed = false;
    const placeSlots = hex.placeSlots.map((slot) => {
      if (slot.type !== 'business' || !slot.business) return slot;
      let b = normalizeBusiness(slot.business);
      const w = Math.max(0, b.workersAssigned);
      if (w <= 0) return slot;

      if (b.type === 'loja') {
        const perTick =
          (SHOP_SIMULATED_CREDS_PER_DAY_PER_WORKER / ECONOMIC_TICKS_PER_WAGE_DAY) *
          w;
        b = {
          ...b,
          credsPending: b.credsPending + perTick,
        };
        changed = true;
        return { ...slot, business: b };
      }

      const tmpl = passiveItemTemplateForKind(b.type);
      if (!tmpl) return slot;
      const perTick = (b.productionRate / ECONOMIC_TICKS_PER_WAGE_DAY) * w;
      b = {
        ...b,
        passiveItemBuffer: addToBuffer(b.passiveItemBuffer, tmpl, perTick),
      };
      changed = true;
      return { ...slot, business: b };
    });
    if (changed) {
      hexes[hexId] = { ...hex, placeSlots };
    }
  }
  return { ...hexMap, hexes };
}

/**
 * Wage day: charge each owner `workersAssigned * wagePerDay`. If insufficient creds, fire all workers on that business.
 */
export function applyPayrollForWageDay(
  hexMap: HexMap,
  characters: Record<string, Character>,
): { hexMap: HexMap; characters: Record<string, Character> } {
  let nextChars = { ...characters };
  const hexes = { ...hexMap.hexes };

  const orderedHexIds = Object.keys(hexes).sort();

  for (const hexId of orderedHexIds) {
    const hex = hexes[hexId];
    let slotsChanged = false;
    const placeSlots = hex.placeSlots.map((slot) => {
      if (slot.type !== 'business' || !slot.business) return slot;
      let b = normalizeBusiness(slot.business);
      const w = b.workersAssigned;
      if (w <= 0) return slot;
      const owner = slot.ownedBy;
      const cost = w * b.wagePerDay;
      const ch = nextChars[owner];
      if (!ch || ch.creds < cost) {
        b = { ...b, workersAssigned: 0 };
        slotsChanged = true;
        return { ...slot, business: b };
      }
      nextChars = {
        ...nextChars,
        [owner]: { ...ch, creds: ch.creds - cost },
      };
      return slot;
    });
    if (slotsChanged) {
      hexes[hexId] = { ...hex, placeSlots };
    }
  }

  return { hexMap: { ...hexMap, hexes }, characters: nextChars };
}
