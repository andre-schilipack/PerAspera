import { ECONOMIC_TICKS_PER_WAGE_DAY } from './constants.ts';
import type {
  Business,
  FabricaRecipeId,
  IndustrialRecipeId,
  PassiveItemBuffer,
} from './types/economy.ts';

/**
 * Max fraction of backlog converted per tick relative to raw inflow rate.
 * Lets buffers drain when workers add supply faster than one tick of conversion.
 */
const INDUSTRIA_CONVERSION_BURST = 4;

function addBuf(buf: PassiveItemBuffer, templateId: string, delta: number): PassiveItemBuffer {
  if (delta <= 0) return buf;
  return { ...buf, [templateId]: (buf[templateId] ?? 0) + delta };
}

function subBuf(buf: PassiveItemBuffer, templateId: string, delta: number): PassiveItemBuffer {
  if (delta <= 0) return buf;
  const next = { ...buf };
  const q = (next[templateId] ?? 0) - delta;
  if (q <= 0.000_001) {
    delete next[templateId];
  } else {
    next[templateId] = q;
  }
  return next;
}

function applyIndustrialTransform(
  buf: PassiveItemBuffer,
  recipe: IndustrialRecipeId,
  rawInflowPerTick: number,
): PassiveItemBuffer {
  let next = buf;
  const conversionCap = rawInflowPerTick * INDUSTRIA_CONVERSION_BURST;

  if (recipe === 'scrap_to_metal') {
    next = addBuf(next, 'scrap_metal', rawInflowPerTick);
    const scrapAvail = next.scrap_metal ?? 0;
    const conv = Math.min(scrapAvail, conversionCap);
    next = subBuf(next, 'scrap_metal', conv);
    next = addBuf(next, 'metal', conv);
    return next;
  }

  next = addBuf(next, 'tronco_madeira', rawInflowPerTick);
  const troncoAvail = next.tronco_madeira ?? 0;
  const convWood = Math.min(troncoAvail, conversionCap);
  next = subBuf(next, 'tronco_madeira', convWood);
  next = addBuf(next, 'madeira', convWood);
  return next;
}

function applyFabricaConstruction(
  buf: PassiveItemBuffer,
  _recipe: FabricaRecipeId,
  throughputPerTick: number,
): PassiveItemBuffer {
  /** Simulated inbound supply per ingredient (MVP until player deposit exists). */
  const third = throughputPerTick / 3;
  let next = buf;
  next = addBuf(next, 'metal', third);
  next = addBuf(next, 'madeira', third);
  next = addBuf(next, 'cimento', third);

  const batch = Math.min(
    next.metal ?? 0,
    next.madeira ?? 0,
    next.cimento ?? 0,
  );
  if (batch <= 0) return next;

  next = subBuf(next, 'metal', batch);
  next = subBuf(next, 'madeira', batch);
  next = subBuf(next, 'cimento', batch);
  next = addBuf(next, 'materiais_construcao', batch);
  return next;
}

/**
 * Passive tick for industria (raw in + transform) or fabrica (triple inflow + batch craft).
 */
export function applyPassiveRecipeBuffers(business: Business): Business {
  const w = Math.max(0, business.workersAssigned);
  if (w <= 0) return business;

  const perTick =
    (business.productionRate / ECONOMIC_TICKS_PER_WAGE_DAY) * w;

  if (business.type === 'industria') {
    const recipe = business.industrialRecipe ?? 'scrap_to_metal';
    return {
      ...business,
      passiveItemBuffer: applyIndustrialTransform(
        business.passiveItemBuffer,
        recipe,
        perTick,
      ),
    };
  }

  if (business.type === 'fabrica') {
    const recipe = business.fabricaRecipe ?? 'construction_bundle';
    return {
      ...business,
      passiveItemBuffer: applyFabricaConstruction(
        business.passiveItemBuffer,
        recipe,
        perTick,
      ),
    };
  }

  return business;
}
