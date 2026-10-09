import {
  CIVILIANS_PER_WORKER_POOL_SLOT,
  DEFAULT_WAGE_PER_DAY,
  NPC_OWNER_PREFEITURA,
  PUBLIC_WORK_TAX_DEFAULT,
} from './constants.ts';
import { getBuildingDef } from './catalog/buildings.ts';
import { applyBuildingProductionTick } from './buildingProduction.ts';
import { normalizeBusinessInventorySlots } from './businessInventorySlots.ts';
import type { Business, PassiveItemBuffer } from './types/economy.ts';
import type { Character } from './types/character.ts';
import type { HexMap } from './types/map.ts';

/** Legacy persisted business before the catalog record. */
interface LegacyBusiness extends Partial<Business> {
  type?: string;
  productionRate?: number;
  credsPending?: number;
  industrialRecipe?: string;
  fabricaRecipe?: string;
  workers?: number;
}

const LEGACY_BUILDING: Record<string, { buildingId: string; recipeId: string }> = {
  fazenda: { buildingId: 'fazenda', recipeId: 'food' },
  outro: { buildingId: 'sucateira', recipeId: 'scrap' },
  fabrica: { buildingId: 'fabrica_construcao', recipeId: 'construction_bundle' },
};

function legacyCatalogKey(raw: LegacyBusiness): { buildingId: string; recipeId: string } | null {
  if (raw.type === 'loja') return null;
  if (raw.type === 'industria') {
    if (raw.industrialRecipe === 'wood_log_to_lumber') {
      return { buildingId: 'serraria', recipeId: 'wood_to_lumber' };
    }
    return { buildingId: 'fundicao', recipeId: 'scrap_to_metal' };
  }
  if (raw.type && LEGACY_BUILDING[raw.type]) return LEGACY_BUILDING[raw.type];
  if (raw.buildingId && getBuildingDef(raw.buildingId)) {
    const def = getBuildingDef(raw.buildingId)!;
    return {
      buildingId: raw.buildingId,
      recipeId: raw.recipeId && def.recipes.some((r) => r.id === raw.recipeId)
        ? raw.recipeId
        : (def.recipes[0]?.id ?? ''),
    };
  }
  return { buildingId: 'fazenda', recipeId: 'food' };
}

/** Normalize persisted businesses, including alpha kinds. */
export function normalizeBusiness(raw: Business | LegacyBusiness): Business {
  const legacy = raw as LegacyBusiness;
  const mapped = legacyCatalogKey(legacy) ?? { buildingId: 'fazenda', recipeId: 'food' };
  const def = getBuildingDef(mapped.buildingId);
  const storage = def?.storageSlots ?? 8;
  const workerSlots = legacy.workerSlots ?? def?.workerSlots ?? 2;
  return {
    id: legacy.id ?? 'biz_unknown',
    name: legacy.name ?? def?.name ?? 'Business',
    buildingId: mapped.buildingId,
    recipeId: mapped.recipeId,
    level: legacy.level ?? 1,
    lastProduction: legacy.lastProduction ?? 0,
    workerSlots,
    workersAssigned: legacy.workersAssigned ?? legacy.workers ?? 0,
    wagePerDay: legacy.wagePerDay ?? DEFAULT_WAGE_PER_DAY,
    passiveItemBuffer: legacy.passiveItemBuffer ?? {},
    inventorySlots: normalizeBusinessInventorySlots(storage, legacy.inventorySlots),
    public: legacy.public ?? false,
    publicWorkTax: legacy.publicWorkTax ?? PUBLIC_WORK_TAX_DEFAULT,
  };
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

export interface MapProductionResult {
  hexMap: HexMap;
  power: number;
  brownedOut: boolean;
  /** Whole units from Prefeitura-owned production, for the city pantry. */
  pantryAdd: PassiveItemBuffer;
}

function addPantry(buf: PassiveItemBuffer, templateId: string, qty: number): void {
  if (qty <= 0) return;
  buf[templateId] = (buf[templateId] ?? 0) + qty;
}

/**
 * One economic tick. Power suppliers run first. Prefeitura output is lifted
 * out of site storage into `pantryAdd` so the civil pantry receives it.
 */
export function applyMapProductionTick(
  hexMap: HexMap,
  power: number,
): MapProductionResult {
  const hexes = { ...hexMap.hexes };
  const pantryAdd: PassiveItemBuffer = {};
  let brownedOut = false;
  let pool = Math.max(0, power);

  const ordered = Object.keys(hexes).sort();
  const phase = (suppliers: boolean) => {
    for (const hexId of ordered) {
      const hex = hexes[hexId];
      let changed = false;
      const placeSlots = hex.placeSlots.map((slot) => {
        if (slot.type !== 'business' || !slot.business) return slot;
        const current = normalizeBusiness(slot.business);
        const def = getBuildingDef(current.buildingId);
        const isSupply = (def?.powerPerDay ?? 0) > 0;
        if (isSupply !== suppliers) return slot;
        const result = applyBuildingProductionTick(current, pool);
        if (result.brownedOut) brownedOut = true;
        pool = Math.max(0, pool + result.powerDelta);
        let business = result.business;
        if (slot.ownedBy === NPC_OWNER_PREFEITURA) {
          for (const [templateId, qty] of Object.entries(result.storedOutput)) {
            addPantry(pantryAdd, templateId, qty);
            let left = qty;
            business = {
              ...business,
              inventorySlots: business.inventorySlots.map((cell) => {
                if (!cell || cell.templateId !== templateId || left <= 0) return cell;
                const take = Math.min(cell.quantity, left);
                left -= take;
                const rest = cell.quantity - take;
                return rest <= 0 ? null : { templateId, quantity: rest };
              }),
            };
          }
        }
        if (business !== slot.business) changed = true;
        return { ...slot, business };
      });
      if (changed) hexes[hexId] = { ...hex, placeSlots };
    }
  };

  phase(true);
  phase(false);

  return { hexMap: { ...hexMap, hexes }, power: pool, brownedOut, pantryAdd };
}

export interface PayrollResult {
  hexMap: HexMap;
  characters: Record<string, Character>;
  treasury: number;
}

/**
 * Wage day: charge `workersAssigned * wagePerDay`.
 * Character owners pay from creds. The Prefeitura pays from `treasury`.
 * Insufficient funds fire every worker on that business.
 */
export function applyPayrollForWageDay(
  hexMap: HexMap,
  characters: Record<string, Character>,
  treasury: number,
): PayrollResult {
  let nextChars = { ...characters };
  let purse = treasury;
  const hexes = { ...hexMap.hexes };
  const orderedHexIds = Object.keys(hexes).sort();

  for (const hexId of orderedHexIds) {
    const hex = hexes[hexId];
    let slotsChanged = false;
    const placeSlots = hex.placeSlots.map((slot) => {
      if (slot.type !== 'business' || !slot.business) return slot;
      const b = normalizeBusiness(slot.business);
      const w = b.workersAssigned;
      if (w <= 0) return slot;
      const cost = w * b.wagePerDay;
      if (slot.ownedBy === NPC_OWNER_PREFEITURA) {
        if (purse < cost) {
          slotsChanged = true;
          return { ...slot, business: { ...b, workersAssigned: 0 } };
        }
        purse -= cost;
        return slot;
      }
      const ch = nextChars[slot.ownedBy];
      if (!ch || ch.creds < cost) {
        slotsChanged = true;
        return { ...slot, business: { ...b, workersAssigned: 0 } };
      }
      nextChars = {
        ...nextChars,
        [slot.ownedBy]: { ...ch, creds: ch.creds - cost },
      };
      return slot;
    });
    if (slotsChanged) hexes[hexId] = { ...hex, placeSlots };
  }

  return { hexMap: { ...hexMap, hexes }, characters: nextChars, treasury: purse };
}

export function housingSlotsOnMap(hexMap: HexMap): number {
  let n = 0;
  for (const hex of Object.values(hexMap.hexes)) {
    for (const slot of hex.placeSlots) {
      if (slot.type !== 'business' || !slot.business) continue;
      const b = normalizeBusiness(slot.business);
      n += getBuildingDef(b.buildingId)?.housingSlots ?? 0;
    }
  }
  return n;
}
