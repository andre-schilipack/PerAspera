import type { Business } from './types/economy.ts';
import type { ItemRarity, ItemType } from './types/items.ts';

/** Output of one Work action on a single owned business (5 STA globally covers all). */
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

/**
 * Active Work payout: creds and/or items from one business tick.
 * Tuned for Alpha — passive daily income comes later (workers).
 */
export function computeWorkPayout(business: Business): BusinessWorkYield {
  const rate = Math.max(1, business.productionRate);

  switch (business.type) {
    case 'fazenda':
      return {
        creds: Math.floor(rate / 4),
        itemGrants: [
          {
            templateId: 'food_ration',
            name: 'Food',
            type: 'consumable',
            rarity: 'comum',
            value: 6,
            effects: { staminaBoost: 10 },
            quantity: 1,
          },
        ],
      };
    case 'loja':
      return {
        creds: Math.floor(rate / 2),
        itemGrants: [],
      };
    case 'industria':
      return {
        creds: Math.floor(rate / 3),
        itemGrants: [
          {
            templateId: 'scrap_metal',
            name: 'Scrap Metal',
            type: 'material',
            rarity: 'comum',
            value: 8,
            effects: {},
            quantity: Math.min(3, 1 + Math.floor(rate / 20)),
          },
        ],
      };
    case 'outro':
    default:
      return {
        creds: Math.floor(rate / 5),
        itemGrants: [],
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
