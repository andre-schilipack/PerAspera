import type { EnemyInstance } from './types/combat.ts';
import type { Item } from './types/items.ts';

/** One loot stack per enemy in the nightly wave (rolled when the wave is spawned). */
export function rollVictoryLootPoolForWave(
  enemies: readonly EnemyInstance[],
  rng: () => number,
  idPrefix: string,
): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < enemies.length; i++) {
    const qty = 1 + Math.floor(rng() * 4);
    out.push({
      id: `${idPrefix}_loot_${i}_${Math.floor(rng() * 1e9)}`,
      name: 'Scrap Metal',
      type: 'material',
      rarity: 'comum',
      value: 8,
      effects: {},
      quantity: qty,
    });
  }
  return out;
}

/**
 * Assigns each item independently to a random participant (uneven counts allowed).
 */
export function distributeItemsAmongParticipants(
  items: readonly Item[],
  participantIds: readonly string[],
  rng: () => number,
): Array<{ characterId: string; items: Item[] }> {
  if (participantIds.length === 0) {
    return [];
  }
  const buckets = new Map<string, Item[]>();
  for (const id of participantIds) {
    buckets.set(id, []);
  }
  let serial = 0;
  for (const item of items) {
    const pick =
      participantIds[Math.floor(rng() * participantIds.length)]!;
    const clone: Item = {
      ...item,
      id: `${item.id}_grant_${String(serial++)}_${Math.floor(rng() * 1e9)}`,
    };
    buckets.get(pick)!.push(clone);
  }
  return participantIds.map((id) => ({
    characterId: id,
    items: buckets.get(id) ?? [],
  }));
}
