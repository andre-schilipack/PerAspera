import { ECONOMIC_TICKS_PER_WAGE_DAY } from './constants.ts';
import { getBuildingDef, recipeOf, type BuildingDef, type RecipeDef } from './catalog/buildings.ts';
import {
  aggregateSlotQuantities,
  consumeTemplateFromBusinessSlots,
  depositIntoBusinessSlots,
} from './businessInventorySlots.ts';
import type { Business, PassiveItemBuffer } from './types/economy.ts';

export interface ProductionTickResult {
  business: Business;
  /** Added to the city pool. Negative when the building drew power. */
  powerDelta: number;
  /** Whole units that could not fit in storage. Already removed from the buffer. */
  lostOutput: PassiveItemBuffer;
  brownedOut: boolean;
  /** Whole units flushed to storage this tick (also sitting in inventorySlots). */
  storedOutput: PassiveItemBuffer;
}

function addBuf(buf: PassiveItemBuffer, templateId: string, delta: number): PassiveItemBuffer {
  if (delta <= 0) return buf;
  return { ...buf, [templateId]: (buf[templateId] ?? 0) + delta };
}

function batchesFor(def: BuildingDef, business: Business, skill: number): number {
  const workers = Math.max(0, business.workersAssigned);
  if (workers <= 0 || def.throughputPerWorkerPerDay <= 0) return 0;
  const level = Math.max(1, business.level);
  return (
    (def.throughputPerWorkerPerDay / ECONOMIC_TICKS_PER_WAGE_DAY) *
    workers *
    level *
    Math.max(0, skill)
  );
}

/**
 * Scale a recipe down to the inputs on hand. Returns 0 when a required input is missing.
 */
function feasibleBatches(
  recipe: RecipeDef,
  requested: number,
  slots: Business['inventorySlots'],
): number {
  if (requested <= 0) return 0;
  if (recipe.inputs.length === 0) return requested;
  const have = aggregateSlotQuantities(slots);
  let cap = requested;
  for (const input of recipe.inputs) {
    if (input.quantity <= 0) continue;
    const avail = have[input.templateId] ?? 0;
    cap = Math.min(cap, avail / input.quantity);
  }
  return Math.max(0, cap);
}

function consumeInputs(
  slots: Business['inventorySlots'],
  recipe: RecipeDef,
  batches: number,
): Business['inventorySlots'] {
  let next = slots;
  for (const input of recipe.inputs) {
    const qty = Math.floor(batches * input.quantity);
    if (qty <= 0) continue;
    next = consumeTemplateFromBusinessSlots(next, input.templateId, qty).slots;
  }
  return next;
}

/**
 * Move whole buffer units into warehouse slots. Units that do not fit are lost.
 * The fractional remainder stays in the buffer.
 */
export function flushBufferToStorage(business: Business): {
  business: Business;
  lost: PassiveItemBuffer;
  stored: PassiveItemBuffer;
} {
  let slots = business.inventorySlots;
  const buffer = { ...business.passiveItemBuffer };
  const lost: PassiveItemBuffer = {};
  const stored: PassiveItemBuffer = {};

  for (const templateId of Object.keys(buffer)) {
    const qty = buffer[templateId] ?? 0;
    const whole = Math.floor(qty);
    const fraction = qty - whole;
    if (whole > 0) {
      const deposited = depositIntoBusinessSlots(slots, templateId, whole);
      slots = deposited.slots;
      const dropped = whole - deposited.deposited;
      if (deposited.deposited > 0) stored[templateId] = deposited.deposited;
      if (dropped > 0) lost[templateId] = dropped;
    }
    if (fraction <= 0.000_001) delete buffer[templateId];
    else buffer[templateId] = fraction;
  }

  return {
    business: { ...business, inventorySlots: slots, passiveItemBuffer: buffer },
    lost,
    stored,
  };
}

/**
 * One economic tick for a single business.
 * Suppliers should run before consumers so this tick's generation can be drawn.
 * `powerAvailable` is the pool before this building. Housing draws even with no workers.
 */
export function applyBuildingProductionTick(
  business: Business,
  powerAvailable: number,
  skill = 1,
): ProductionTickResult {
  const def = getBuildingDef(business.buildingId);
  if (!def) {
    return {
      business,
      powerDelta: 0,
      lostOutput: {},
      brownedOut: false,
      storedOutput: {},
    };
  }

  if (def.role === 'housing') {
    const draw = Math.abs(def.powerPerDay) / ECONOMIC_TICKS_PER_WAGE_DAY;
    if (powerAvailable + 0.000_001 < draw) {
      return {
        business,
        powerDelta: -powerAvailable,
        lostOutput: {},
        brownedOut: true,
        storedOutput: {},
      };
    }
    return {
      business,
      powerDelta: -draw,
      lostOutput: {},
      brownedOut: false,
      storedOutput: {},
    };
  }

  if (def.role === 'service' || def.recipes.length === 0) {
    return {
      business,
      powerDelta: 0,
      lostOutput: {},
      brownedOut: false,
      storedOutput: {},
    };
  }

  const recipe = recipeOf(def, business.recipeId);
  if (!recipe || business.workersAssigned <= 0) {
    return {
      business,
      powerDelta: 0,
      lostOutput: {},
      brownedOut: false,
      storedOutput: {},
    };
  }

  const requested =
    def.role === 'power' ? (business.workersAssigned > 0 ? 1 : 0) : batchesFor(def, business, skill);
  const batches = feasibleBatches(recipe, requested, business.inventorySlots);
  const draw = def.powerPerDay < 0 ? Math.abs(def.powerPerDay) / ECONOMIC_TICKS_PER_WAGE_DAY : 0;

  if (batches <= 0) {
    return {
      business,
      powerDelta: 0,
      lostOutput: {},
      brownedOut: false,
      storedOutput: {},
    };
  }

  if (draw > 0 && powerAvailable + 0.000_001 < draw) {
    return {
      business,
      powerDelta: 0,
      lostOutput: {},
      brownedOut: true,
      storedOutput: {},
    };
  }

  let slots = consumeInputs(business.inventorySlots, recipe, batches);
  let buffer = { ...business.passiveItemBuffer };
  for (const output of recipe.outputs) {
    buffer = addBuf(buffer, output.templateId, batches * output.quantity);
  }

  const flushed = flushBufferToStorage({
    ...business,
    inventorySlots: slots,
    passiveItemBuffer: buffer,
  });

  const supply = def.powerPerDay > 0 ? def.powerPerDay / ECONOMIC_TICKS_PER_WAGE_DAY : 0;

  return {
    business: flushed.business,
    powerDelta: supply - draw,
    lostOutput: flushed.lost,
    brownedOut: false,
    storedOutput: flushed.stored,
  };
}
