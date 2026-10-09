import { NPC_OWNER_PREFEITURA, WORK_ACTION_BATCHES } from './constants.ts';
import { getBuildingDef, recipeOf } from './catalog/buildings.ts';
import { normalizeBusiness } from './businessEconomyTick.ts';
import { depositIntoBusinessSlots } from './businessInventorySlots.ts';
import type { Business } from './types/economy.ts';
import type { ItemRarity, ItemType } from './types/items.ts';
import type { HexTile } from './types/map.ts';
import { getMarketCatalogEntry } from './marketCatalog.ts';

export interface ItemGrant {
  templateId: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  value: number;
  effects: Record<string, number>;
  quantity: number;
}

export interface ManualWorkResult {
  business: Business;
  /** Items the acting character keeps. */
  grants: ItemGrant[];
  /** Tax slice. Prefeitura owners should add this to the pantry. */
  ownerShare: { templateId: string; quantity: number }[];
}

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
 * One stamina work action.
 * The owner's own action keeps the full item yield.
 * A public action pays the other character in items, minus `publicWorkTax`,
 * which stays with the site owner. No creds are paid.
 * Skill multiplier is 1 until the skill sheet exists.
 */
export function resolveManualWork(
  business: Business,
  actorId: string,
  ownerId: string,
  skill = 1,
): ManualWorkResult {
  const b = normalizeBusiness(business);
  const def = getBuildingDef(b.buildingId);
  const recipe = def ? recipeOf(def, b.recipeId) : undefined;
  if (!def || !recipe || recipe.outputs.length === 0) {
    return { business: b, grants: [], ownerShare: [] };
  }
  const isOwner = actorId === ownerId;
  if (!isOwner && !b.public) {
    return { business: b, grants: [], ownerShare: [] };
  }

  const batches = Math.max(1, Math.round(WORK_ACTION_BATCHES * Math.max(0, skill)));
  const grants: ItemGrant[] = [];
  const ownerShare: { templateId: string; quantity: number }[] = [];
  let slots = b.inventorySlots;

  for (const output of recipe.outputs) {
    const total = output.quantity * batches;
    const tax = !isOwner ? Math.round(total * b.publicWorkTax) : 0;
    const keep = Math.max(0, total - tax);
    const stub = itemGrantTemplate(output.templateId);
    if (stub && keep > 0) grants.push({ ...stub, quantity: keep });
    if (tax > 0) {
      ownerShare.push({ templateId: output.templateId, quantity: tax });
      if (ownerId !== NPC_OWNER_PREFEITURA) {
        slots = depositIntoBusinessSlots(slots, output.templateId, tax).slots;
      }
    }
  }

  return { business: { ...b, inventorySlots: slots }, grants, ownerShare };
}

export function mergeItemGrants(grants: readonly ItemGrant[]): ItemGrant[] {
  const byTemplate = new Map<string, ItemGrant>();
  for (const g of grants) {
    const prev = byTemplate.get(g.templateId);
    if (!prev) byTemplate.set(g.templateId, { ...g });
    else byTemplate.set(g.templateId, { ...prev, quantity: prev.quantity + g.quantity });
  }
  return [...byTemplate.values()];
}

export function hasCharacterBusinessOnHex(
  hex: HexTile | undefined,
  characterId: string,
): boolean {
  if (!hex) return false;
  return hex.placeSlots.some(
    (p) => p.type === 'business' && p.business != null && p.ownedBy === characterId,
  );
}

export function hexHasWorkTarget(hex: HexTile | undefined, characterId: string): boolean {
  if (!hex) return false;
  return hex.placeSlots.some((p) => {
    if (p.type !== 'business' || !p.business) return false;
    if (p.ownedBy === characterId) return true;
    return normalizeBusiness(p.business).public;
  });
}
