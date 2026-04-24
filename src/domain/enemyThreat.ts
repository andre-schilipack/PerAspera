import { enemyBucketForSpawnIndex } from './defenseTactics.ts';
import type { EnemyInstance } from './types/combat.ts';

export type WallCardinal = 'north' | 'south' | 'east' | 'west';

export const WALL_CARDINALS: WallCardinal[] = [
  'north',
  'south',
  'east',
  'west',
];

export function pickRandomWallCardinal(rng: () => number): WallCardinal {
  const i = Math.floor(rng() * WALL_CARDINALS.length);
  return WALL_CARDINALS[i]!;
}

/** Chess-like threat weight per enemy kind (tunable). */
export const ENEMY_THREAT_POINTS: Record<string, number> = {
  street_drone: 1,
  drone_scout: 1,
};

export function threatPointsForEnemyId(enemyId: string): number {
  return ENEMY_THREAT_POINTS[enemyId] ?? 1;
}

export function sumLivingThreatPoints(enemies: readonly EnemyInstance[]): number {
  let s = 0;
  for (const e of enemies) {
    if (e.currentHealth > 0) {
      s += threatPointsForEnemyId(e.enemyId);
    }
  }
  return s;
}

/**
 * Total threat budget for the nightly wave (scales with game day).
 * Tune with balance passes — no special-cased "first N days" rule.
 */
export function targetThreatBudget(gameDayIndex: number): number {
  const d = Math.max(0, gameDayIndex);
  return 2 + Math.floor(d / 2);
}

const DEFAULT_DRONE_HP = 22;

/**
 * Build a wave that sums to at most `budget` threat points (greedy: add cheapest first).
 */
export function composeWaveFromBudget(
  budget: number,
  rng: () => number,
): EnemyInstance[] {
  const b = Math.max(0, budget);
  if (b <= 0) return [];

  const out: EnemyInstance[] = [];
  let remaining = b;
  const id = 'drone_scout';
  const per = threatPointsForEnemyId(id);
  let spawnIndex = 0;

  while (remaining >= per) {
    const hp = DEFAULT_DRONE_HP + Math.floor(rng() * 10);
    out.push({
      enemyId: id,
      currentHealth: hp,
      maxHealth: hp,
      tacticalBucket: enemyBucketForSpawnIndex(spawnIndex),
      buffs: {},
    });
    spawnIndex += 1;
    remaining -= per;
  }
  return out;
}
