import type { ItemRarity, ItemType } from './types/index.ts';

/** Limits how often a consumable can be applied (see design doc). */
export type ConsumableCooldown = 'daily' | 'per_skirmish';

export interface MarketCatalogEntry {
  templateId: string;
  /** Display name (Portuguese UI copy). */
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  value: number;
  effects: Record<string, number>;
  /** Only for consumables with restricted frequency. */
  consumableCooldown?: ConsumableCooldown;
}

/** Fixed municipal prices (buy === sell at same value for Alpha). */
export const MARKET_CATALOG: readonly MarketCatalogEntry[] = [
  {
    templateId: 'food_ration',
    name: 'Food',
    type: 'consumable',
    rarity: 'common',
    value: 6,
    effects: { staminaBoost: 10 },
  },
  {
    templateId: 'neon_stim',
    name: 'Neon Stim',
    type: 'consumable',
    rarity: 'common',
    value: 12,
    effects: { staminaBoost: 15 },
  },
  {
    templateId: 'mate_tea',
    name: 'Chá mate',
    type: 'consumable',
    rarity: 'common',
    value: 10,
    effects: { staminaBoost: 20 },
    consumableCooldown: 'daily',
  },
  {
    templateId: 'dorplex',
    name: 'Dorplex',
    type: 'consumable',
    rarity: 'common',
    value: 14,
    effects: { healthBoost: 20 },
    consumableCooldown: 'daily',
  },
  {
    templateId: 'bruise_spray',
    name: 'Spray de contusão',
    type: 'consumable',
    rarity: 'common',
    value: 18,
    effects: { healthBoost: 20 },
    consumableCooldown: 'per_skirmish',
  },
  {
    templateId: 'scrap_metal',
    name: 'Sucata metálica',
    type: 'material',
    rarity: 'common',
    value: 8,
    effects: {},
  },
  {
    templateId: 'metal',
    name: 'Metal',
    type: 'material',
    rarity: 'common',
    value: 14,
    effects: {},
  },
  {
    templateId: 'lumber',
    name: 'Madeira',
    type: 'material',
    rarity: 'common',
    value: 10,
    effects: {},
  },
  {
    templateId: 'cement',
    name: 'Cimento',
    type: 'material',
    rarity: 'common',
    value: 12,
    effects: {},
  },
  {
    templateId: 'wood_log',
    name: 'Tronco de Madeira',
    type: 'material',
    rarity: 'common',
    value: 5,
    effects: {},
  },
  {
    templateId: 'construction_supplies',
    name: 'Materiais de construção',
    type: 'material',
    rarity: 'common',
    value: 40,
    effects: {},
  },
  {
    templateId: 'concrete_patch',
    name: 'Remendo de Concreto',
    type: 'repair_material',
    rarity: 'common',
    value: 25,
    effects: { repairAmount: 20 },
  },
  {
    templateId: 'mace',
    name: 'Maça',
    type: 'weapon',
    rarity: 'common',
    value: 45,
    effects: { minLevel: 1, attackBonus: 2 },
  },
  {
    templateId: 'crossbow',
    name: 'Besta',
    type: 'weapon',
    rarity: 'common',
    value: 55,
    effects: { minLevel: 1, damageBonus: 2 },
  },
  {
    templateId: 'shield',
    name: 'Escudo',
    type: 'upgrade',
    rarity: 'common',
    value: 50,
    effects: { minLevel: 2, defenseBonus: 5 },
  },
  {
    templateId: 'reinforced_coat',
    name: 'Casaco reforçado',
    type: 'upgrade',
    rarity: 'common',
    value: 42,
    effects: { minLevel: 2, defenseBonus: 3 },
  },
  {
    templateId: 'helmet',
    name: 'Capacete',
    type: 'upgrade',
    rarity: 'common',
    value: 38,
    effects: { minLevel: 2, defenseBonus: 3 },
  },
  {
    templateId: 'excavator',
    name: 'Escavadeira',
    type: 'tool',
    rarity: 'rare',
    value: 120,
    effects: { futureMining: 1 },
  },
  {
    templateId: 'truck',
    name: 'Caminhão',
    type: 'tool',
    rarity: 'common',
    value: 90,
    effects: { mobileCarrySlots: 8 },
  },
];

const CATALOG_BY_TEMPLATE_ID: ReadonlyMap<string, MarketCatalogEntry> =
  new Map(MARKET_CATALOG.map((e) => [e.templateId, e]));

export function getMarketCatalogEntry(
  templateId: string,
): MarketCatalogEntry | undefined {
  return CATALOG_BY_TEMPLATE_ID.get(templateId);
}
