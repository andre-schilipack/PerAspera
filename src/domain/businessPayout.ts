import type { Business } from './types/economy.ts';
import type { ItemRarity, ItemType } from './types/items.ts';
import type { Hex } from './types/map.ts';

import { getMarketCatalogEntry } from './marketCatalog.ts';

/** Output of one Work action on a single owned business on the current hex. */
export interface BusinessWorkYield {
  creds: number;
  /** Items to add (caller assigns instance ids). */
  itemGrants: readonly ItemGrant[];
}

export interface ItemGrant {
  templateId: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  value: number;
  effects: Record<string, number>;
  quantity: number;
}

/** Template metadata for items (quantity added by caller). Production types: no creds from active Work. */
export function itemGrantTemplate(
  templateId: string,
): Omit<ItemGrant, 'quantity'> | null {
  const entry = getMarketCatalogEntry(templateId);
  if (!entry) return null;
  return {
    templateId: entry.templateId,
    name: entry.name,
    type: entry.type,
    rarity: entry.rarity,
    value: entry.value,
    effects: { ...entry.effects },
  };
}

/**
 * Active Work: instant STA tick. Production businesses yield items only (no creds).
 * Loja: no creds/items until passive sales + claim (MVP).
 */
export function computeWorkPayout(business: Business): BusinessWorkYield {
  const rate = Math.max(1, business.productionRate);

  switch (business.type) {
    case 'fazenda':
      return {
        creds: 0,
        itemGrants: [
          {
            templateId: 'food_ration',
            name: 'Food',
            type: 'consumable',
            rarity: 'comum',
            value: 6,
            effects: { staminaBoost: 10 },
            quantity: Math.max(1, Math.floor(rate / 8)),
          },
        ],
      };
    case 'loja':
      return {
        creds: 0,
        itemGrants: [],
      };
    case 'industria':
      return {
        creds: 0,
        itemGrants: [
          {
            templateId: 'scrap_metal',
            name: 'Scrap Metal',
            type: 'material',
            rarity: 'comum',
            value: 8,
            effects: {},
            quantity: Math.min(3, Math.max(1, Math.floor(rate / 12))),
          },
        ],
      };
    case 'outro':
    default:
      return {
        creds: 0,
        itemGrants: [
          {
            templateId: 'scrap_metal',
            name: 'Scrap Metal',
            type: 'material',
            rarity: 'comum',
            value: 8,
            effects: {},
            quantity: Math.max(1, Math.floor(rate / 10)),
          },
        ],
      };
  }
}

/** Merge duplicate template lines (e.g. two farms → one Food ×2). */
export function mergeItemGrants(
  grants: readonly ItemGrant[],
): ItemGrant[] {
  const byTemplate = new Map<string, ItemGrant>();
  for (const g of grants) {
    const prev = byTemplate.get(g.templateId);
    if (!prev) {
      byTemplate.set(g.templateId, { ...g });
    } else {
      byTemplate.set(g.templateId, {
        ...prev,
        quantity: prev.quantity + g.quantity,
      });
    }
  }
  return [...byTemplate.values()];
}

/** True if the hex has at least one business slot owned by the character. */
export function hasCharacterBusinessOnHex(
  hex: Hex | undefined,
  characterId: string,
): boolean {
  if (!hex) return false;
  return hex.placeSlots.some(
    (p) =>
      p.type === 'business' &&
      p.business != null &&
      p.ownedBy === characterId,
  );
}
