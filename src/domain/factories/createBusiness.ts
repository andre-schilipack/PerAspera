import {
  DEFAULT_WAGE_PER_DAY,
  DEFAULT_WORKER_SLOTS,
  defaultBusinessInventorySlotCount,
} from '../constants.ts';
import {
  createEmptyBusinessInventorySlots,
} from '../businessInventorySlots.ts';
import type { Business, BusinessKind } from '../types/economy.ts';

export function createNewBusiness(params: {
  id: string;
  name: string;
  type: BusinessKind;
  nowMs: number;
  productionRate: number;
}): Business {
  return {
    id: params.id,
    name: params.name,
    type: params.type,
    level: 1,
    productionRate: params.productionRate,
    lastProduction: params.nowMs,
    workerSlots: DEFAULT_WORKER_SLOTS,
    workersAssigned: 0,
    wagePerDay: DEFAULT_WAGE_PER_DAY,
    passiveItemBuffer: {},
    credsPending: 0,
    inventorySlots: createEmptyBusinessInventorySlots(
      defaultBusinessInventorySlotCount(params.type),
    ),
  };
}
