/**
 * Act 1 building catalog. Rates are untuned placeholders.
 * The save stores buildingId + recipeId, not this table.
 */

export type SiteRole = 'harvest' | 'transform' | 'power' | 'housing' | 'service';

export interface ItemQty {
  templateId: string;
  quantity: number;
}

export interface RecipeDef {
  id: string;
  inputs: readonly ItemQty[];
  outputs: readonly ItemQty[];
}

export interface BuildingDef {
  id: string;
  /** Player-facing name (Portuguese). */
  name: string;
  role: SiteRole;
  recipes: readonly RecipeDef[];
  /**
   * Energy added to the city pool per wage day when the building runs.
   * Negative values draw from the pool.
   */
  powerPerDay: number;
  housingSlots: number;
  storageSlots: number;
  workerSlots: number;
  /** Recipe batches one assigned worker completes per wage day. */
  throughputPerWorkerPerDay: number;
}

const ONE = 48;

export const BUILDING_CATALOG: readonly BuildingDef[] = [
  {
    id: 'fazenda',
    name: 'Fazenda',
    role: 'harvest',
    recipes: [{ id: 'food', inputs: [], outputs: [{ templateId: 'food_ration', quantity: 1 }] }],
    powerPerDay: -24,
    housingSlots: 0,
    storageSlots: 8,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'sucateira',
    name: 'Sucateira',
    role: 'harvest',
    recipes: [{ id: 'scrap', inputs: [], outputs: [{ templateId: 'scrap_metal', quantity: 1 }] }],
    powerPerDay: -24,
    housingSlots: 0,
    storageSlots: 8,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'madeireira',
    name: 'Madeireira',
    role: 'harvest',
    recipes: [{ id: 'logs', inputs: [], outputs: [{ templateId: 'wood_log', quantity: 1 }] }],
    powerPerDay: -24,
    housingSlots: 0,
    storageSlots: 8,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'pedreira',
    name: 'Pedreira',
    role: 'harvest',
    recipes: [{ id: 'cement', inputs: [], outputs: [{ templateId: 'cement', quantity: 1 }] }],
    powerPerDay: -24,
    housingSlots: 0,
    storageSlots: 8,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'fundicao',
    name: 'Fundição',
    role: 'transform',
    recipes: [
      {
        id: 'scrap_to_metal',
        inputs: [{ templateId: 'scrap_metal', quantity: 1 }],
        outputs: [{ templateId: 'metal', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 12,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'serraria',
    name: 'Serraria',
    role: 'transform',
    recipes: [
      {
        id: 'wood_to_lumber',
        inputs: [{ templateId: 'wood_log', quantity: 1 }],
        outputs: [{ templateId: 'lumber', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 12,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'carvoaria',
    name: 'Carvoaria',
    role: 'transform',
    recipes: [
      {
        id: 'wood_to_coal',
        inputs: [{ templateId: 'wood_log', quantity: 1 }],
        outputs: [{ templateId: 'coal', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 12,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'fabrica_construcao',
    name: 'Fábrica de construção',
    role: 'transform',
    recipes: [
      {
        id: 'construction_bundle',
        inputs: [
          { templateId: 'metal', quantity: 1 },
          { templateId: 'lumber', quantity: 1 },
          { templateId: 'cement', quantity: 1 },
        ],
        outputs: [{ templateId: 'construction_supplies', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 12,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'oficina',
    name: 'Oficina',
    role: 'transform',
    recipes: [
      {
        id: 'mace',
        inputs: [
          { templateId: 'metal', quantity: 1 },
          { templateId: 'lumber', quantity: 1 },
        ],
        outputs: [{ templateId: 'mace', quantity: 1 }],
      },
      {
        id: 'crossbow',
        inputs: [
          { templateId: 'metal', quantity: 1 },
          { templateId: 'lumber', quantity: 1 },
        ],
        outputs: [{ templateId: 'crossbow', quantity: 1 }],
      },
      {
        id: 'shield',
        inputs: [
          { templateId: 'metal', quantity: 1 },
          { templateId: 'lumber', quantity: 1 },
        ],
        outputs: [{ templateId: 'shield', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 12,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'cartucheira',
    name: 'Cartucheira',
    role: 'transform',
    recipes: [
      {
        id: 'ammo',
        inputs: [{ templateId: 'metal', quantity: 1 }],
        outputs: [{ templateId: 'ammo', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 12,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'atelier',
    name: 'Ateliê',
    role: 'transform',
    recipes: [
      {
        id: 'consumer_goods',
        inputs: [{ templateId: 'lumber', quantity: 1 }],
        outputs: [{ templateId: 'consumer_goods', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 8,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'laboratorio',
    name: 'Laboratório',
    role: 'transform',
    recipes: [
      {
        id: 'tech_from_power',
        inputs: [],
        outputs: [{ templateId: 'tech_consumable', quantity: 1 }],
      },
    ],
    powerPerDay: -48,
    housingSlots: 0,
    storageSlots: 8,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'termoeletrica',
    name: 'Termelétrica',
    role: 'power',
    recipes: [
      {
        id: 'burn_coal',
        inputs: [{ templateId: 'coal', quantity: 1 }],
        outputs: [],
      },
    ],
    powerPerDay: 480,
    housingSlots: 0,
    storageSlots: 8,
    workerSlots: 2,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'eolico',
    name: 'Eólico',
    role: 'power',
    recipes: [{ id: 'wind', inputs: [], outputs: [] }],
    powerPerDay: 96,
    housingSlots: 0,
    storageSlots: 4,
    workerSlots: 1,
    throughputPerWorkerPerDay: ONE,
  },
  {
    id: 'moradia',
    name: 'Moradia',
    role: 'housing',
    recipes: [],
    powerPerDay: -12,
    housingSlots: 4,
    storageSlots: 4,
    workerSlots: 0,
    throughputPerWorkerPerDay: 0,
  },
  {
    id: 'hospital',
    name: 'Hospital',
    role: 'service',
    recipes: [],
    powerPerDay: 0,
    housingSlots: 0,
    storageSlots: 4,
    workerSlots: 0,
    throughputPerWorkerPerDay: 0,
  },
];

const BY_ID = new Map(BUILDING_CATALOG.map((b) => [b.id, b]));

export function getBuildingDef(id: string): BuildingDef | undefined {
  return BY_ID.get(id);
}

export function recipeOf(def: BuildingDef, recipeId: string): RecipeDef | undefined {
  return def.recipes.find((r) => r.id === recipeId) ?? def.recipes[0];
}

/** Buildings a player can raise on an owned empty lot. */
export function playerBuildableCatalog(): readonly BuildingDef[] {
  return BUILDING_CATALOG;
}
