import type { ItemRarity, ItemType } from '../domain/types/index.ts';

export interface MarketCatalogEntry {
  templateId: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  value: number;
  effects: Record<string, number>;
}

/** Fixed municipal prices (buy === sell at same value for Alpha). */
export const MARKET_CATALOG: readonly MarketCatalogEntry[] = [
  {
    templateId: 'food_ration',
    name: 'Food',
    type: 'consumable',
    rarity: 'comum',
    value: 6,
    effects: { staminaBoost: 10 },
  },
  {
    templateId: 'neon_stim',
    name: 'Neon Stim',
    type: 'consumable',
    rarity: 'comum',
    value: 12,
    effects: { staminaBoost: 15 },
  },
  {
    templateId: 'scrap_metal',
    name: 'Scrap Metal',
    type: 'material',
    rarity: 'comum',
    value: 8,
    effects: {},
  },
  {
    templateId: 'concrete_patch',
    name: 'Concrete Patch',
    type: 'repair_material',
    rarity: 'comum',
    value: 25,
    effects: { repairAmount: 20 },
  },
];
