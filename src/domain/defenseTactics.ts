import type { DefenseTacticalBucket, EnemyInstance } from './types/combat.ts';

/** Line index maps to rotating bucket roles (Front → Ranged → Support). */
export function defenderBucketForLineIndex(index: number): DefenseTacticalBucket {
  const order: DefenseTacticalBucket[] = ['front', 'ranged', 'support'];
  return order[index % 3]!;
}

/** Spawn index maps buckets across the wave composition. */
export function enemyBucketForSpawnIndex(index: number): DefenseTacticalBucket {
  return defenderBucketForLineIndex(index);
}

export function rollTowerTargetBucket(rng: () => number): DefenseTacticalBucket {
  const r = rng();
  if (r < 0.52) return 'front';
  if (r < 0.82) return 'ranged';
  return 'support';
}

export function rollGuardTargetBucket(rng: () => number): DefenseTacticalBucket {
  const r = rng();
  if (r < 0.45) return 'front';
  if (r < 0.85) return 'ranged';
  return 'support';
}

export function pickLivingEnemyIndexPreferBucket(
  enemies: readonly EnemyInstance[],
  bucket: DefenseTacticalBucket,
  rng: () => number,
): number {
  const livingIndices = enemies
    .map((e, i) => (e.currentHealth > 0 ? i : -1))
    .filter((i): i is number => i >= 0);
  if (livingIndices.length === 0) return -1;
  const pref = livingIndices.filter(
    (i) => (enemies[i]!.tacticalBucket ?? 'front') === bucket,
  );
  const pool = pref.length > 0 ? pref : livingIndices;
  return pool[Math.floor(rng() * pool.length)]!;
}

export function applyDamageToEnemyAt(
  enemies: EnemyInstance[],
  index: number,
  damage: number,
): EnemyInstance[] {
  if (index < 0 || index >= enemies.length) return enemies;
  const e = enemies[index]!;
  if (e.currentHealth <= 0) return enemies;
  const nh = Math.max(0, e.currentHealth - damage);
  const next = [...enemies];
  next[index] = { ...e, currentHealth: nh };
  return next;
}

export function countLivingInBucket(
  enemies: readonly EnemyInstance[],
  bucket: DefenseTacticalBucket,
): number {
  let n = 0;
  for (const e of enemies) {
    if (e.currentHealth > 0 && (e.tacticalBucket ?? 'front') === bucket) {
      n += 1;
    }
  }
  return n;
}

export function livingEnemyCount(enemies: readonly EnemyInstance[]): number {
  let n = 0;
  for (const e of enemies) {
    if (e.currentHealth > 0) n += 1;
  }
  return n;
}

export function totalLivingHp(enemies: readonly EnemyInstance[]): number {
  let s = 0;
  for (const e of enemies) {
    if (e.currentHealth > 0) s += e.currentHealth;
  }
  return s;
}

/**
 * Prefer matching defender bucket when this enemy strikes a player line slot.
 */
export function resolveDefenderStrikeLineIndex(
  enemy: EnemyInstance,
  defenderLine: readonly {
    currentHp: number;
    retreated: boolean;
    tacticalBucket: DefenseTacticalBucket;
  }[],
  suggestedLineIndex: number,
): number {
  const pref = enemy.tacticalBucket;
  const sug = defenderLine[suggestedLineIndex];
  if (
    sug &&
    !sug.retreated &&
    sug.currentHp > 0 &&
    (sug.tacticalBucket ?? 'front') === pref
  ) {
    return suggestedLineIndex;
  }
  const anyMatch = defenderLine.findIndex(
    (d) =>
      !d.retreated &&
      d.currentHp > 0 &&
      (d.tacticalBucket ?? 'front') === pref,
  );
  if (anyMatch >= 0) return anyMatch;
  return suggestedLineIndex;
}
