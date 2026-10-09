/** Pending passive item quantities (float); templateId → units. */
export type PassiveItemBuffer = Record<string, number>;

/** One warehouse slot at a business; same template merges when depositing. */
export type BusinessInventorySlot = {
  templateId: string;
  quantity: number;
} | null;

export interface Business {
  id: string;
  name: string;
  /** Catalog key. See {@link ../catalog/buildings.ts}. */
  buildingId: string;
  /** Selected recipe on that catalog entry. */
  recipeId: string;
  level: number;
  lastProduction: number;
  workerSlots: number;
  workersAssigned: number;
  /** Per worker; charged once per wage day. */
  wagePerDay: number;
  /** Fractional leftovers after whole units move into storage or the pantry. */
  passiveItemBuffer: PassiveItemBuffer;
  inventorySlots: BusinessInventorySlot[];
  /** When true, another character may take the work action. */
  public: boolean;
  /** 0–1. Slice of a public work action kept by the site owner. */
  publicWorkTax: number;
}
