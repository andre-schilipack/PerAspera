import { describe, expect, it } from 'vitest';

import { applyPassiveRecipeBuffers } from './businessPassiveRecipes.ts';
import type { Business } from './types/economy.ts';

function bizBase(over: Partial<Business>): Business {
  return {
    id: 'b1',
    name: 'Test',
    type: 'industria',
    level: 1,
    productionRate: 48,
    lastProduction: 0,
    workerSlots: 2,
    workersAssigned: 1,
    wagePerDay: 8,
    passiveItemBuffer: {},
    credsPending: 0,
    ...over,
  };
}

describe('applyPassiveRecipeBuffers', () => {
  it('converts sucata inflow to metal for scrap_to_metal', () => {
    const b0 = bizBase({
      type: 'industria',
      industrialRecipe: 'scrap_to_metal',
    });
    const b1 = applyPassiveRecipeBuffers(b0);
    expect((b1.passiveItemBuffer.metal ?? 0) > 0).toBe(true);
  });

  it('converts tronco inflow to madeira for tronco_to_madeira', () => {
    const b0 = bizBase({
      type: 'industria',
      industrialRecipe: 'tronco_to_madeira',
    });
    const b1 = applyPassiveRecipeBuffers(b0);
    expect((b1.passiveItemBuffer.madeira ?? 0) > 0).toBe(true);
  });

  it('fabrica batches metal + madeira + cimento into materiais_construcao', () => {
    const b0 = bizBase({
      type: 'fabrica',
      fabricaRecipe: 'construction_bundle',
    });
    const b1 = applyPassiveRecipeBuffers(b0);
    expect(b1.passiveItemBuffer.materiais_construcao).toBeDefined();
    expect((b1.passiveItemBuffer.materiais_construcao ?? 0) > 0).toBe(true);
  });

  it('does nothing without workers', () => {
    const b0 = bizBase({
      type: 'industria',
      workersAssigned: 0,
    });
    const b1 = applyPassiveRecipeBuffers(b0);
    expect(b1).toEqual(b0);
  });
});
