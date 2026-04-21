import { ECONOMIC_TICKS_PER_WAGE_DAY } from './constants.ts';
import {
  aggregateSlotQuantities,
  consumeTemplateFromBusinessSlots,
} from './businessInventorySlots.ts';
import type {
  Business,
  BusinessInventorySlot,
  FabricaRecipeId,
  IndustrialRecipeId,
  PassiveItemBuffer,
} from './types/economy.ts';

/**
 * Max units transformed per tick relative to worker throughput (backlog drain).
 */
const INDUSTRIA_CONVERSION_BURST = 4;

function addBuf(buf: PassiveItemBuffer, templateId: string, delta: number): PassiveItemBuffer {
  if (delta <= 0) return buf;
  return { ...buf, [templateId]: (buf[templateId] ?? 0) + delta };
}

function applyIndustrialTransform(
  buf: PassiveItemBuffer,
  slots: BusinessInventorySlot[],
  recipe: IndustrialRecipeId,
  rawConvertCap: number,
): {
  passiveItemBuffer: PassiveItemBuffer;
  inventorySlots: BusinessInventorySlot[];
} {
  const conversionCap = rawConvertCap * INDUSTRIA_CONVERSION_BURST;

  if (recipe === 'scrap_to_metal') {
    const agg = aggregateSlotQuantities(slots);
    const scrapAvail = agg.scrap_metal ?? 0;
    const conv = Math.min(scrapAvail, conversionCap);
    if (conv <= 0) return { passiveItemBuffer: buf, inventorySlots: slots };

    const { slots: nextSlots, consumed } = consumeTemplateFromBusinessSlots(
      slots,
      'scrap_metal',
      conv,
    );
    if (consumed <= 0) return { passiveItemBuffer: buf, inventorySlots: slots };

    return {
      passiveItemBuffer: addBuf(buf, 'metal', consumed),
      inventorySlots: nextSlots,
    };
  }

  const agg = aggregateSlotQuantities(slots);
  const logAvail = agg.wood_log ?? 0;
  const convWood = Math.min(logAvail, conversionCap);
  if (convWood <= 0) return { passiveItemBuffer: buf, inventorySlots: slots };

  const { slots: nextSlots, consumed } = consumeTemplateFromBusinessSlots(
    slots,
    'wood_log',
    convWood,
  );
  if (consumed <= 0) return { passiveItemBuffer: buf, inventorySlots: slots };

  return {
    passiveItemBuffer: addBuf(buf, 'lumber', consumed),
    inventorySlots: nextSlots,
  };
}

/**
 * Refined metal + lumber + cement → construction supplies.
 * `scrap_metal` is only used in industria (→ metal).
 */
function applyFabricaConstruction(
  buf: PassiveItemBuffer,
  slots: BusinessInventorySlot[],
  _recipe: FabricaRecipeId,
): {
  passiveItemBuffer: PassiveItemBuffer;
  inventorySlots: BusinessInventorySlot[];
} {
  const agg = aggregateSlotQuantities(slots);
  const metal = agg.metal ?? 0;
  const lumber = agg.lumber ?? 0;
  const cement = agg.cement ?? 0;
  const batch = Math.min(metal, lumber, cement);
  if (batch <= 0) return { passiveItemBuffer: buf, inventorySlots: slots };

  let nextSlots = slots;
  nextSlots = consumeTemplateFromBusinessSlots(nextSlots, 'metal', batch).slots;
  nextSlots = consumeTemplateFromBusinessSlots(nextSlots, 'lumber', batch).slots;
  nextSlots = consumeTemplateFromBusinessSlots(nextSlots, 'cement', batch).slots;

  return {
    passiveItemBuffer: addBuf(buf, 'construction_supplies', batch),
    inventorySlots: nextSlots,
  };
}

/**
 * Passive tick for industria (consume warehouse inputs → output buffer) or fabrica.
 */
export function applyPassiveRecipeBuffers(business: Business): Business {
  const w = Math.max(0, business.workersAssigned);
  if (w <= 0) return business;

  const perTick =
    (business.productionRate / ECONOMIC_TICKS_PER_WAGE_DAY) * w;

  if (business.type === 'industria') {
    const recipe = business.industrialRecipe ?? 'scrap_to_metal';
    const { passiveItemBuffer, inventorySlots } = applyIndustrialTransform(
      business.passiveItemBuffer,
      business.inventorySlots,
      recipe,
      perTick,
    );
    return {
      ...business,
      passiveItemBuffer,
      inventorySlots,
    };
  }

  if (business.type === 'fabrica') {
    const recipe = business.fabricaRecipe ?? 'construction_bundle';
    const { passiveItemBuffer, inventorySlots } = applyFabricaConstruction(
      business.passiveItemBuffer,
      business.inventorySlots,
      recipe,
    );
    return {
      ...business,
      passiveItemBuffer,
      inventorySlots,
    };
  }

  return business;
}
