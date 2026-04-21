export type BusinessKind =
  | 'loja'
  | 'industria'
  | 'fabrica'
  | 'fazenda'
  | 'outro';

/** Industria: raw material → processed material (passive transform). */
export type IndustrialRecipeId = 'scrap_to_metal' | 'wood_log_to_lumber';

/** Fabrica: multiple materials → finished stackable item. */
export type FabricaRecipeId = 'construction_bundle';

/** Pending passive item quantities (float); templateId → units. */
export type PassiveItemBuffer = Record<string, number>;

/** One warehouse slot at a business; same template merges when depositing (see domain logic). */
export type BusinessInventorySlot = {
  templateId: string;
  quantity: number;
} | null;

export interface Business {
  id: string;
  name: string;
  type: BusinessKind;
  level: number;
  /** Baseline daily passive units for production types (items/day into buffer). */
  productionRate: number;
  lastProduction: number;
  outputItemId?: string;
  workerSlots: number;
  workersAssigned: number;
  /** Per worker; charged to owner once per {@link ECONOMIC_TICKS_PER_WAGE_DAY} ticks. */
  wagePerDay: number;
  /** Production: item stockpile; loja: typically empty here. */
  passiveItemBuffer: PassiveItemBuffer;
  /** Loja only: creds from simulated/future sales (float). */
  credsPending: number;
  /** Industria only: which transformation chain runs (passive + Work raw grant). */
  industrialRecipe?: IndustrialRecipeId;
  /** Fabrica only: assembled output recipe. */
  fabricaRecipe?: FabricaRecipeId;
  /** Fixed-length warehouse for inputs (and optional stock); empty slot = null. */
  inventorySlots: BusinessInventorySlot[];
}
