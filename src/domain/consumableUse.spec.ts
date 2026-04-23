import { describe, expect, it } from 'vitest';

import { ONE_DAY_MS } from './constants.ts';
import { getMarketCatalogEntry } from './marketCatalog.ts';
import {
  inferTemplateIdFromItem,
  isDailyConsumableOnCooldown,
  tryUseConsumable,
} from './consumableUse.ts';
import type { Character } from './types/character.ts';
import type { Item } from './types/items.ts';

function baseCharacter(over: Partial<Character> = {}): Character {
  const now = 1_700_000_000_000;
  return {
    id: 'c1',
    name: 'Test',
    age: 16,
    level: 3,
    exp: 0,
    creds: 100,
    stamina: { current: 50, max: 240, lastUpdated: now },
    health: { current: 40, max: 100, lastUpdated: now },
    score: 0,
    reputation: 0,
    homeHexId: '0,0',
    currentHexId: '0,0',
    coreAttributes: {
      strength: 1,
      agility: 1,
      intelligence: 1,
      vitality: 1,
      charisma: 1,
      willpower: 1,
    },
    combatLoadout: { skillIds: [], equippedItemInstanceIds: [] },
    currentDefenseContribution: 0,
    inventory: [],
    createdAt: now,
    ...over,
  };
}

describe('consumableUse', () => {
  it('inferTemplateIdFromItem prefers explicit templateId', () => {
    const item: Item = {
      id: 'legacy_id',
      templateId: 'mate_tea',
      name: 'Chá mate',
      type: 'consumable',
      rarity: 'common',
      value: 10,
      effects: { staminaBoost: 20 },
      quantity: 1,
    };
    expect(inferTemplateIdFromItem(item)).toBe('mate_tea');
  });

  it('inferTemplateIdFromItem parses id prefix by longest template match', () => {
    const item: Item = {
      id: 'scrap_metal_vendor_123',
      name: 'Scrap Metal',
      type: 'material',
      rarity: 'common',
      value: 8,
      effects: {},
      quantity: 2,
    };
    expect(inferTemplateIdFromItem(item)).toBe('scrap_metal');
  });

  it('daily consumable applies stamina and sets cooldown', () => {
    const nowMs = 1_800_000_000_000;
    const cha = getMarketCatalogEntry('mate_tea');
    expect(cha).toBeDefined();
    const character = baseCharacter({
      stamina: { current: 50, max: 240, lastUpdated: nowMs },
    });
    const item: Item = {
      id: `mate_tea_${String(nowMs)}_0`,
      templateId: 'mate_tea',
      name: 'Chá mate',
      type: 'consumable',
      rarity: 'common',
      value: 10,
      effects: { staminaBoost: 20 },
      quantity: 1,
    };
    const r = tryUseConsumable({
      character,
      item,
      catalog: cha!,
      nowMs,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.characterPatch.stamina?.current).toBe(70);
    expect(r.characterPatch.consumableCooldownUntilMs?.mate_tea).toBe(
      nowMs + ONE_DAY_MS,
    );
    expect(r.cooldownKind).toBe('daily');
  });

  it('blocks daily consumable while on cooldown', () => {
    const nowMs = 1_800_000_000_000;
    const cha = getMarketCatalogEntry('mate_tea')!;
    const character = baseCharacter({
      consumableCooldownUntilMs: { mate_tea: nowMs + ONE_DAY_MS },
    });
    const item: Item = {
      id: `mate_tea_${String(nowMs)}_0`,
      templateId: 'mate_tea',
      name: 'Chá mate',
      type: 'consumable',
      rarity: 'common',
      value: 10,
      effects: { staminaBoost: 20 },
      quantity: 1,
    };
    const r = tryUseConsumable({
      character,
      item,
      catalog: cha,
      nowMs,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('daily_cooldown');
  });

  it('bruise_spray uses daily cooldown like other healing consumables', () => {
    const nowMs = 1_800_000_000_000;
    const spray = getMarketCatalogEntry('bruise_spray')!;
    const character = baseCharacter({ id: 'hero' });
    const item: Item = {
      id: `bruise_spray_${String(nowMs)}_0`,
      templateId: 'bruise_spray',
      name: 'Spray de contusão',
      type: 'consumable',
      rarity: 'common',
      value: 18,
      effects: { healthBoost: 20 },
      quantity: 1,
    };
    const ok = tryUseConsumable({
      character,
      item,
      catalog: spray,
      nowMs,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.characterPatch.health?.current).toBe(60);
    expect(ok.cooldownKind).toBe('daily');
    expect(ok.characterPatch.consumableCooldownUntilMs?.bruise_spray).toBe(
      nowMs + ONE_DAY_MS,
    );
  });

  it('isDailyConsumableOnCooldown respects until timestamp', () => {
    const ch = baseCharacter({
      consumableCooldownUntilMs: { dorplex: 100 },
    });
    expect(isDailyConsumableOnCooldown(ch, 'dorplex', 50)).toBe(true);
    expect(isDailyConsumableOnCooldown(ch, 'dorplex', 100)).toBe(false);
  });
});
