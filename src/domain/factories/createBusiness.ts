import {
  DEFAULT_WAGE_PER_DAY,
  PUBLIC_WORK_TAX_DEFAULT,
} from '../constants.ts';
import { getBuildingDef } from '../catalog/buildings.ts';
import { createEmptyBusinessInventorySlots } from '../businessInventorySlots.ts';
import type { Business } from '../types/economy.ts';

export function createNewBusiness(params: {
  id: string;
  buildingId: string;
  nowMs: number;
  recipeId?: string;
  workersAssigned?: number;
  isPublic?: boolean;
  publicWorkTax?: number;
}): Business {
  const def = getBuildingDef(params.buildingId);
  const recipeId = params.recipeId ?? def?.recipes[0]?.id ?? '';
  return {
    id: params.id,
    name: def?.name ?? params.buildingId,
    buildingId: params.buildingId,
    recipeId,
    level: 1,
    lastProduction: params.nowMs,
    workerSlots: def?.workerSlots ?? 2,
    workersAssigned: params.workersAssigned ?? 0,
    wagePerDay: DEFAULT_WAGE_PER_DAY,
    passiveItemBuffer: {},
    inventorySlots: createEmptyBusinessInventorySlots(def?.storageSlots ?? 8),
    public: params.isPublic ?? false,
    publicWorkTax: params.publicWorkTax ?? PUBLIC_WORK_TAX_DEFAULT,
  };
}
