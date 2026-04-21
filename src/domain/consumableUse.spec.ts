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
    availableMoves: [],
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
      templateId: 'cha_mate',
      name: 'Chá mate',
      type: 'consumable',
      rarity: 'comum',
      value: 10,
      effects: { staminaBoost: 20 },
      quantity: 1,
    };
    expect(inferTemplateIdFromItem(item)).toBe('cha_mate');
  });

  it('inferTemplateIdFromItem parses id prefix by longest template match', () => {
    const item: Item = {
      id: 'scrap_metal_skirmish_123',
      name: 'Scrap Metal',
      type: 'material',
      rarity: 'comum',
      value: 8,
      effects: {},
      quantity: 2,
    };
    expect(inferTemplateIdFromItem(item)).toBe('scrap_metal');
  });

  it('daily consumable applies stamina and sets cooldown', () => {
    const nowMs = 1_800_000_000_000;
    const cha = getMarketCatalogEntry('cha_mate');
    expect(cha).toBeDefined();
    const character = baseCharacter({ stamina: { current: 50, max: 240, lastUpdated: nowMs } });
    const item: Item = {
      id: `cha_mate_${String(nowMs)}_0`,
      templateId: 'cha_mate',
      name: 'Chá mate',
      type: 'consumable',
      rarity: 'comum',
      value: 10,
      effects: { staminaBoost: 20 },
      quantity: 1,
    };
    const r = tryUseConsumable({
      character,
      item,
      catalog: cha!,
      nowMs,
      skirmishActive: false,
      skirmishCharacterId: null,
      perSkirmishUsed: {},
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.characterPatch.stamina?.current).toBe(70);
    expect(r.characterPatch.consumableCooldownUntilMs?.cha_mate).toBe(
      nowMs + ONE_DAY_MS,
    );
    expect(r.cooldownKind).toBe('daily');
  });

  it('blocks daily consumable while on cooldown', () => {
    const nowMs = 1_800_000_000_000;
    const cha = getMarketCatalogEntry('cha_mate')!;
    const character = baseCharacter({
      consumableCooldownUntilMs: { cha_mate: nowMs + ONE_DAY_MS },
    });
    const item: Item = {
      id: `cha_mate_${String(nowMs)}_0`,
      templateId: 'cha_mate',
      name: 'Chá mate',
      type: 'consumable',
      rarity: 'comum',
      value: 10,
      effects: { staminaBoost: 20 },
      quantity: 1,
    };
    const r = tryUseConsumable({
      character,
      item,
      catalog: cha,
      nowMs,
      skirmishActive: false,
      skirmishCharacterId: null,
      perSkirmishUsed: {},
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('daily_cooldown');
  });

  it('per_skirmish consumable requires active skirmish for same character', () => {
    const nowMs = 1_800_000_000_000;
    const spray = getMarketCatalogEntry('spray_contusao')!;
    const character = baseCharacter({ id: 'hero' });
    const item: Item = {
      id: `spray_contusao_${String(nowMs)}_0`,
      templateId: 'spray_contusao',
      name: 'Spray de contusão',
      type: 'consumable',
      rarity: 'comum',
      value: 18,
      effects: { healthBoost: 20 },
      quantity: 1,
    };
    const blocked = tryUseConsumable({
      character,
      item,
      catalog: spray,
      nowMs,
      skirmishActive: false,
      skirmishCharacterId: null,
      perSkirmishUsed: {},
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe('per_skirmish_requires_active_fight');

    const ok = tryUseConsumable({
      character,
      item,
      catalog: spray,
      nowMs,
      skirmishActive: true,
      skirmishCharacterId: 'hero',
      perSkirmishUsed: {},
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.characterPatch.health?.current).toBe(60);
    expect(ok.cooldownKind).toBe('per_skirmish');
  });

  it('isDailyConsumableOnCooldown respects until timestamp', () => {
    const ch = baseCharacter({
      consumableCooldownUntilMs: { dorplex: 100 },
    });
    expect(isDailyConsumableOnCooldown(ch, 'dorplex', 50)).toBe(true);
    expect(isDailyConsumableOnCooldown(ch, 'dorplex', 100)).toBe(false);
  });
});
