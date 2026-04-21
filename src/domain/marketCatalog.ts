import type { ItemRarity, ItemType } from './types/index.ts';

/** Limits how often a consumable can be applied (see design doc). */
export type ConsumableCooldown = 'daily' | 'per_skirmish';

export interface MarketCatalogEntry {
  templateId: string;
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
    templateId: 'cha_mate',
    name: 'Chá mate',
    type: 'consumable',
    rarity: 'comum',
    value: 10,
    effects: { staminaBoost: 20 },
    consumableCooldown: 'daily',
  },
  {
    templateId: 'dorplex',
    name: 'Dorplex',
    type: 'consumable',
    rarity: 'comum',
    value: 14,
    effects: { healthBoost: 20 },
    consumableCooldown: 'daily',
  },
  {
    templateId: 'spray_contusao',
    name: 'Spray de contusão',
    type: 'consumable',
    rarity: 'comum',
    value: 18,
    effects: { healthBoost: 20 },
    consumableCooldown: 'per_skirmish',
  },
  {
    templateId: 'scrap_metal',
    name: 'Sucata metálica',
    type: 'material',
    rarity: 'comum',
    value: 8,
    effects: {},
  },
  {
    templateId: 'metal',
    name: 'Metal',
    type: 'material',
    rarity: 'comum',
    value: 14,
    effects: {},
  },
  {
    templateId: 'madeira',
    name: 'Madeira',
    type: 'material',
    rarity: 'comum',
    value: 10,
    effects: {},
  },
  {
    templateId: 'cimento',
    name: 'Cimento',
    type: 'material',
    rarity: 'comum',
    value: 12,
    effects: {},
  },
  {
    templateId: 'tronco_madeira',
    name: 'Tronco de Madeira',
    type: 'material',
    rarity: 'comum',
    value: 5,
    effects: {},
  },
  {
    templateId: 'materiais_construcao',
    name: 'Materiais de construção',
    type: 'material',
    rarity: 'comum',
    value: 40,
    effects: {},
  },
  {
    templateId: 'concrete_patch',
    name: 'Remendo de Concreto',
    type: 'repair_material',
    rarity: 'comum',
    value: 25,
    effects: { repairAmount: 20 },
  },
  {
    templateId: 'maca',
    name: 'Maça',
    type: 'weapon',
    rarity: 'comum',
    value: 45,
    effects: { minLevel: 1, attackBonus: 2 },
  },
  {
    templateId: 'besta',
    name: 'Besta',
    type: 'weapon',
    rarity: 'comum',
    value: 55,
    effects: { minLevel: 1, damageBonus: 2 },
  },
  {
    templateId: 'escudo',
    name: 'Escudo',
    type: 'upgrade',
    rarity: 'comum',
    value: 50,
    effects: { minLevel: 2, defenseBonus: 5 },
  },
  {
    templateId: 'casaco_reforcado',
    name: 'Casaco reforçado',
    type: 'upgrade',
    rarity: 'comum',
    value: 42,
    effects: { minLevel: 2, defenseBonus: 3 },
  },
  {
    templateId: 'capacete',
    name: 'Capacete',
    type: 'upgrade',
    rarity: 'comum',
    value: 38,
    effects: { minLevel: 2, defenseBonus: 3 },
  },
  {
    templateId: 'escavadeira',
    name: 'Escavadeira',
    type: 'tool',
    rarity: 'raro',
    value: 120,
    effects: { futureMining: 1 },
  },
  {
    templateId: 'caminhao',
    name: 'Caminhão',
    type: 'tool',
    rarity: 'comum',
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
