import { describe, expect, it } from 'vitest';

import {
  createEmptyBusinessInventorySlots,
  depositIntoBusinessSlots,
} from './businessInventorySlots.ts';
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
    inventorySlots: createEmptyBusinessInventorySlots(12),
    ...over,
  };
}

describe('applyPassiveRecipeBuffers', () => {
  it('converts scrap to metal for scrap_to_metal', () => {
    const slots = depositIntoBusinessSlots(
      createEmptyBusinessInventorySlots(12),
      'scrap_metal',
      100,
    ).slots;
    const b0 = bizBase({
      type: 'industria',
      industrialRecipe: 'scrap_to_metal',
      inventorySlots: slots,
    });
    const b1 = applyPassiveRecipeBuffers(b0);
    expect((b1.passiveItemBuffer.metal ?? 0) > 0).toBe(true);
  });

  it('converts wood logs to lumber for wood_log_to_lumber', () => {
    const slots = depositIntoBusinessSlots(
      createEmptyBusinessInventorySlots(12),
      'wood_log',
      100,
    ).slots;
    const b0 = bizBase({
      type: 'industria',
      industrialRecipe: 'wood_log_to_lumber',
      inventorySlots: slots,
    });
    const b1 = applyPassiveRecipeBuffers(b0);
    expect((b1.passiveItemBuffer.lumber ?? 0) > 0).toBe(true);
  });

  it('fabrica batches metal + lumber + cement into construction_supplies', () => {
    let slots = createEmptyBusinessInventorySlots(12);
    slots = depositIntoBusinessSlots(slots, 'metal', 20).slots;
    slots = depositIntoBusinessSlots(slots, 'lumber', 20).slots;
    slots = depositIntoBusinessSlots(slots, 'cement', 20).slots;
    const b0 = bizBase({
      type: 'fabrica',
      fabricaRecipe: 'construction_bundle',
      inventorySlots: slots,
    });
    const b1 = applyPassiveRecipeBuffers(b0);
    expect(b1.passiveItemBuffer.construction_supplies).toBeDefined();
    expect((b1.passiveItemBuffer.construction_supplies ?? 0) > 0).toBe(true);
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
