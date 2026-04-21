import { describe, expect, it } from 'vitest';

import type { EnemyInstance } from './types/combat.ts';
import {
  enemyBucketForSpawnIndex,
  pickLivingEnemyIndexPreferBucket,
  resolveDefenderStrikeLineIndex,
} from './defenseTactics.ts';

describe('defenseTactics', () => {
  it('cycles spawn buckets deterministically', () => {
    expect(enemyBucketForSpawnIndex(0)).toBe('front');
    expect(enemyBucketForSpawnIndex(1)).toBe('ranged');
    expect(enemyBucketForSpawnIndex(2)).toBe('support');
  });

  it('prefers enemies in the requested bucket when picking targets', () => {
    const enemies: EnemyInstance[] = [
      {
        enemyId: 'a',
        currentHealth: 5,
        maxHealth: 5,
        tacticalBucket: 'front',
        buffs: {},
      },
      {
        enemyId: 'b',
        currentHealth: 8,
        maxHealth: 8,
        tacticalBucket: 'ranged',
        buffs: {},
      },
    ];
    const idx = pickLivingEnemyIndexPreferBucket(enemies, 'ranged', () => 0);
    expect(idx).toBe(1);
  });

  it('redirects strikes toward a defender who matches the enemy bucket', () => {
    const line = [
      {
        characterId: 'x',
        name: 'Alice',
        currentHp: 10,
        maxHp: 10,
        retreated: false,
        tacticalBucket: 'front' as const,
      },
      {
        characterId: 'y',
        name: 'Bob',
        currentHp: 10,
        maxHp: 10,
        retreated: false,
        tacticalBucket: 'ranged' as const,
      },
    ];
    const enemy: EnemyInstance = {
      enemyId: 'drone',
      currentHealth: 10,
      maxHealth: 10,
      tacticalBucket: 'ranged',
      buffs: {},
    };
    expect(resolveDefenderStrikeLineIndex(enemy, line, 0)).toBe(1);
  });
});
