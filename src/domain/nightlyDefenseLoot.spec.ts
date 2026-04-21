import { describe, expect, it } from 'vitest';

import type { Item } from './types/items.ts';
import {
  distributeItemsAmongParticipants,
  rollVictoryLootPoolForWave,
} from './nightlyDefenseLoot.ts';

describe('distributeItemsAmongParticipants', () => {
  it('assigns every item to exactly one participant', () => {
    const items: Item[] = Array.from({ length: 8 }, (_, i) => ({
      id: `scrap_${String(i)}`,
      name: 'Scrap Metal',
      type: 'material',
      rarity: 'common',
      value: 8,
      effects: {},
      quantity: 1,
    }));
    const rng = (() => {
      let n = 0;
      return () => {
        n += 0.37;
        return n % 1;
      };
    })();
    const out = distributeItemsAmongParticipants(items, ['a', 'b', 'c'], rng);
    const sum = out.reduce((s, g) => s + g.items.length, 0);
    expect(sum).toBe(8);
    expect(out.map((g) => g.characterId)).toEqual(['a', 'b', 'c']);
  });

  it('returns empty when no participants', () => {
    const out = distributeItemsAmongParticipants(
      [
        {
          id: 'x',
          name: 'Scrap Metal',
          type: 'material',
          rarity: 'common',
          value: 1,
          effects: {},
          quantity: 1,
        },
      ],
      [],
      () => 0.5,
    );
    expect(out).toEqual([]);
  });
});

describe('rollVictoryLootPoolForWave', () => {
  it('creates one loot stack per enemy', () => {
    const enemies = [
      { enemyId: 'drone_scout', currentHealth: 10, maxHealth: 10, buffs: {} },
      { enemyId: 'drone_scout', currentHealth: 10, maxHealth: 10, buffs: {} },
    ];
    const pool = rollVictoryLootPoolForWave(enemies, () => 0.5, 'test');
    expect(pool.length).toBe(2);
  });
});
