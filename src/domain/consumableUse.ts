import type { Character } from './types/character.ts';
import type { Item } from './types/items.ts';

import type { MarketCatalogEntry } from './marketCatalog.ts';
import {
  getMarketCatalogEntry,
  MARKET_CATALOG,
} from './marketCatalog.ts';

import { ONE_DAY_MS } from './constants.ts';

/** User-facing Portuguese strings for inventory UI (caller may override). */
export function describeUseConsumableFailure(
  reason: UseConsumableFailureReason,
): string {
  switch (reason) {
    case 'not_consumable':
      return 'Este item não é um consumível.';
    case 'unknown_template':
      return 'Item não reconhecido — possível save antigo.';
    case 'daily_cooldown':
      return 'Em cooldown diário.';
    case 'per_skirmish_requires_active_fight':
      return 'Só pode usar durante uma briga de rua ativa.';
    case 'per_skirmish_already_used':
      return 'Já usaste isto nesta briga.';
    case 'no_effect':
      return 'Este item não tem efeitos aplicáveis.';
    default:
      return 'Não foi possível usar.';
  }
}

export type UseConsumableFailureReason =
  | 'not_consumable'
  | 'unknown_template'
  | 'daily_cooldown'
  | 'per_skirmish_requires_active_fight'
  | 'per_skirmish_already_used'
  | 'no_effect';

export type UseConsumableResult =
  | {
      ok: true;
      characterPatch: Partial<Character>;
      templateId: string;
      cooldownKind: 'daily' | 'per_skirmish' | null;
    }
  | { ok: false; reason: UseConsumableFailureReason };

/**
 * Infer stable template id from persisted items (new saves set Item.templateId).
 */
export function inferTemplateIdFromItem(item: Item): string | undefined {
  if (item.templateId) return item.templateId;
  const sorted = [...MARKET_CATALOG].sort(
    (a, b) => b.templateId.length - a.templateId.length,
  );
  for (const row of sorted) {
    const prefix = `${row.templateId}_`;
    if (item.id.startsWith(prefix)) return row.templateId;
  }
  return undefined;
}

export function resolveMarketEntryForItem(
  item: Item,
): MarketCatalogEntry | undefined {
  const tid = inferTemplateIdFromItem(item);
  if (!tid) return undefined;
  return getMarketCatalogEntry(tid);
}

export function isDailyConsumableOnCooldown(
  character: Character,
  templateId: string,
  nowMs: number,
): boolean {
  const until = character.consumableCooldownUntilMs?.[templateId];
  return typeof until === 'number' && nowMs < until;
}

function applyConsumableStatEffects(
  character: Character,
  effects: Record<string, number>,
  nowMs: number,
): Pick<Character, 'stamina' | 'health'> | null {
  const staminaBoost = effects.staminaBoost;
  const healthBoost = effects.healthBoost;
  if (
    (staminaBoost == null || staminaBoost <= 0) &&
    (healthBoost == null || healthBoost <= 0)
  ) {
    return null;
  }

  let stamina = character.stamina;
  let health = character.health;

  if (staminaBoost != null && staminaBoost > 0) {
    stamina = {
      ...stamina,
      current: Math.min(stamina.max, stamina.current + staminaBoost),
      lastUpdated: nowMs,
    };
  }
  if (healthBoost != null && healthBoost > 0) {
    health = {
      ...health,
      current: Math.min(health.max, health.current + healthBoost),
      lastUpdated: nowMs,
    };
  }

  return { stamina, health };
}

/**
 * Validates usage rules and returns character patches (stats + optional daily cooldown).
 * Caller applies inventory decrement and per-skirmish bookkeeping.
 */
export function tryUseConsumable(params: {
  character: Character;
  item: Item;
  catalog: MarketCatalogEntry;
  nowMs: number;
  /** Active street skirmish session for this character id. */
  skirmishActive: boolean;
  skirmishCharacterId: string | null;
  perSkirmishUsed: Readonly<Record<string, boolean>>;
}): UseConsumableResult {
  const { character, item, catalog, nowMs } = params;

  if (catalog.type !== 'consumable') {
    return { ok: false, reason: 'not_consumable' };
  }

  const templateId = inferTemplateIdFromItem(item);
  if (!templateId || templateId !== catalog.templateId) {
    return { ok: false, reason: 'unknown_template' };
  }

  const cooldown = catalog.consumableCooldown;

  if (cooldown === 'daily') {
    if (isDailyConsumableOnCooldown(character, templateId, nowMs)) {
      return { ok: false, reason: 'daily_cooldown' };
    }
  }

  if (cooldown === 'per_skirmish') {
    if (
      !params.skirmishActive ||
      params.skirmishCharacterId !== character.id
    ) {
      return { ok: false, reason: 'per_skirmish_requires_active_fight' };
    }
    if (params.perSkirmishUsed[templateId]) {
      return { ok: false, reason: 'per_skirmish_already_used' };
    }
  }

  const stats = applyConsumableStatEffects(character, catalog.effects, nowMs);
  if (!stats) {
    return { ok: false, reason: 'no_effect' };
  }

  const characterPatch: Partial<Character> = {
    stamina: stats.stamina,
    health: stats.health,
  };

  let cooldownKind: 'daily' | 'per_skirmish' | null = null;

  if (cooldown === 'daily') {
    cooldownKind = 'daily';
    characterPatch.consumableCooldownUntilMs = {
      ...character.consumableCooldownUntilMs,
      [templateId]: nowMs + ONE_DAY_MS,
    };
  } else if (cooldown === 'per_skirmish') {
    cooldownKind = 'per_skirmish';
  }

  return {
    ok: true,
    characterPatch,
    templateId,
    cooldownKind,
  };
}
