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
 * Legacy day-scaled budget (tests / fallback). Prefer
 * {@link waveBudgetFromCityThreat} — the nest drives campaign pressure.
 */
export function targetThreatBudget(gameDayIndex: number): number {
  const d = Math.max(0, gameDayIndex);
  return 2 + Math.floor(d / 2);
}

/** Nightly wave size from the city threat meter (nest pressure). */
export function waveBudgetFromCityThreat(cityThreatLevel: number): number {
  return Math.max(0, Math.floor(cityThreatLevel));
}

export function growCityThreatLevel(
  current: number,
  growthPerDay: number,
): number {
  return Math.max(0, current + Math.max(0, growthPerDay));
}

/**
 * Reduce campaign threat from nest structure HP lost in an offensive.
 * Full nest destroy removes `fullNestThreatReduction` points.
 */
export function reduceCityThreatFromNestDamage(params: {
  cityThreatLevel: number;
  nestHpLost: number;
  nestMaxHp: number;
  fullNestThreatReduction: number;
}): { nextThreat: number; threatReduced: number } {
  const maxHp = Math.max(1, params.nestMaxHp);
  const lost = Math.max(0, params.nestHpLost);
  const threatReduced =
    (lost / maxHp) * Math.max(0, params.fullNestThreatReduction);
  const nextThreat = Math.max(0, params.cityThreatLevel - threatReduced);
  return { nextThreat, threatReduced };
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
