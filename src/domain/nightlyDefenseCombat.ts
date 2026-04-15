import { resolveIncomingMeleeDamage } from './combatResolution.ts';
import {
  DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
  DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
  DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
  DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
  DEFENSE_GUARD_DAMAGE_MAX,
  DEFENSE_GUARD_DAMAGE_MIN,
  DEFENSE_NPC_GUARD_IDS,
  DEFENSE_NPC_TOWER_LABEL,
  DEFENSE_RETREAT_HP_FRACTION,
  DEFENSE_TOWER_DAMAGE_MAX,
  DEFENSE_TOWER_DAMAGE_MIN,
} from './constants.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import { applyDamageToWallSection } from './wallIntegrity.ts';
import type { CombatLogEntry, EnemyInstance } from './types/combat.ts';
import type {
  DailyDefenseState,
  DefenderLineEntry,
  NightlyDefenseOutcome,
  WallState,
} from './types/defense.ts';

export interface NightlyCombatWallResult {
  wall: WallState;
  breached: boolean;
}

export interface AdvanceNightlyDefenseResult {
  nextDaily: DailyDefenseState;
  wallResult: NightlyCombatWallResult;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
}

function rollIntInclusive(
  rng: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function defaultRng(): number {
  return Math.random();
}

function firstLivingEnemyIndex(enemies: readonly EnemyInstance[]): number {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i]!.currentHealth > 0) return i;
  }
  return -1;
}

function applyFinalDamageToFirstLiving(
  enemies: EnemyInstance[],
  finalDamage: number,
): EnemyInstance[] {
  const idx = firstLivingEnemyIndex(enemies);
  if (idx < 0) return enemies;
  const e = enemies[idx]!;
  const nh = Math.max(0, e.currentHealth - finalDamage);
  const next = [...enemies];
  next[idx] = { ...e, currentHealth: nh };
  return next;
}

/**
 * Strike order: each living defender in line order, then the wall (repeats by modulo).
 */
function buildEnemyStrikeCycle(
  defenderLine: DefenderLineEntry[],
): Array<{ kind: 'defender'; lineIndex: number } | { kind: 'wall' }> {
  const cycle: Array<
    { kind: 'defender'; lineIndex: number } | { kind: 'wall' }
  > = [];
  for (let i = 0; i < defenderLine.length; i++) {
    const d = defenderLine[i]!;
    if (!d.retreated && d.currentHp > 0) {
      cycle.push({ kind: 'defender', lineIndex: i });
    }
  }
  cycle.push({ kind: 'wall' });
  return cycle;
}

function applyRetreatRules(entry: DefenderLineEntry): DefenderLineEntry {
  const threshold = Math.ceil(entry.maxHp * DEFENSE_RETREAT_HP_FRACTION);
  if (entry.currentHp <= threshold && entry.currentHp > 0) {
    return { ...entry, retreated: true };
  }
  return entry;
}

/**
 * One full combat round: tower + guards + player line, then living enemies strike.
 */
export function advanceNightlyDefenseRound(
  daily: DailyDefenseState,
  wall: WallState,
  rng: () => number = defaultRng,
): AdvanceNightlyDefenseResult {
  const noop: AdvanceNightlyDefenseResult = {
    nextDaily: daily,
    wallResult: { wall, breached: false },
    fightEnded: false,
    newLogLines: [],
  };

  if (
    daily.isCompleted ||
    daily.phase !== 'fighting' ||
    daily.outcome !== 'active'
  ) {
    return noop;
  }

  if (daily.enemies.length === 0) {
    return {
      nextDaily: {
        ...daily,
        isCompleted: true,
        phase: 'ended',
        outcome: 'victory',
        victoryLootPool: daily.victoryLootPool,
      },
      wallResult: { wall, breached: false },
      fightEnded: true,
      newLogLines: [
        {
          turn: daily.currentTurn,
          timestamp: Date.now(),
          text: 'No hostiles — defense stands down.',
          type: 'system',
        },
      ],
    };
  }

  const turn = daily.currentTurn + 1;
  const t0 = Date.now();
  const lines: Omit<CombatLogEntry, 'id'>[] = [];
  let enemies = [...daily.enemies];
  let defenderLine = daily.defenderLine.map((d) => ({ ...d }));
  let nextWall = wall;
  let breached = false;

  lines.push({
    turn,
    timestamp: t0,
    text: `— Nightly defense round ${String(turn)} —`,
    type: 'system',
  });

  const towerRaw = rollIntInclusive(
    rng,
    DEFENSE_TOWER_DAMAGE_MIN,
    DEFENSE_TOWER_DAMAGE_MAX,
  );
  const towerHit = resolveIncomingMeleeDamage(towerRaw, rng);
  enemies = applyFinalDamageToFirstLiving(enemies, towerHit.finalDamage);
  lines.push({
    turn,
    timestamp: t0,
    text: towerHit.flags.dodged
      ? `${DEFENSE_NPC_TOWER_LABEL}: shot evaded by hostiles.`
      : `${DEFENSE_NPC_TOWER_LABEL} fires for ${String(towerHit.finalDamage)} damage.`,
    type: 'system',
  });

  for (let gi = 0; gi < DEFENSE_NPC_GUARD_IDS.length; gi++) {
    const graw = rollIntInclusive(
      rng,
      DEFENSE_GUARD_DAMAGE_MIN,
      DEFENSE_GUARD_DAMAGE_MAX,
    );
    const gh = resolveIncomingMeleeDamage(graw, rng);
    enemies = applyFinalDamageToFirstLiving(enemies, gh.finalDamage);
    lines.push({
      turn,
      timestamp: t0,
      text: gh.flags.dodged
        ? `Rifle guard: burst evaded.`
        : `Rifle guard fires for ${String(gh.finalDamage)} damage.`,
      type: 'guarda',
    });
  }

  for (const def of defenderLine) {
    if (def.retreated || def.currentHp <= 0) continue;
    if (firstLivingEnemyIndex(enemies) < 0) break;
    const raw = rollIntInclusive(rng, 5, 12);
    const hit = resolveIncomingMeleeDamage(raw, rng);
    enemies = applyFinalDamageToFirstLiving(enemies, hit.finalDamage);
    lines.push({
      turn,
      timestamp: t0,
      text: hit.flags.dodged
        ? `${def.name}'s strike is evaded.`
        : `${def.name} hits for ${String(hit.finalDamage)} damage.`,
      type: 'player',
    });
  }

  enemies = enemies.filter((e) => e.currentHealth > 0);

  const strikeCycle = buildEnemyStrikeCycle(defenderLine);

  for (let ei = 0; ei < enemies.length; ei++) {
    const e = enemies[ei]!;
    if (breached) break;
    const slot = strikeCycle[ei % strikeCycle.length]!;

    const hitWall = (): void => {
      const raw = rollIntInclusive(
        rng,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MIN,
        DEFENSE_ENEMY_STRIKE_VS_WALL_MAX,
      );
      nextWall = applyDamageToWallSection(
        nextWall,
        daily.attackedSection,
        raw,
      );
      const sec = nextWall.sections[daily.attackedSection];
      breached = sec.breached || sec.current <= 0;
      lines.push({
        turn,
        timestamp: t0,
        text: `Hostiles strike the ${daily.attackedSection} wall for ${String(raw)} structural damage.`,
        type: 'enemy',
      });
    };

    if (slot.kind === 'wall') {
      hitWall();
      continue;
    }

    const di = slot.lineIndex;
    const d = defenderLine[di]!;
    if (d.retreated || d.currentHp <= 0) {
      lines.push({
        turn,
        timestamp: t0,
        text: `${e.enemyId} aims at ${d.name}'s position — line down; pressure on the wall.`,
        type: 'enemy',
      });
      hitWall();
      continue;
    }

    const raw = rollIntInclusive(
      rng,
      DEFENSE_ENEMY_STRIKE_VS_PLAYER_MIN,
      DEFENSE_ENEMY_STRIKE_VS_PLAYER_MAX,
    );
    const strike = resolveIncomingMeleeDamage(raw, rng);
    const nextHp = strike.flags.dodged
      ? d.currentHp
      : Math.max(0, d.currentHp - strike.finalDamage);
    let nextD: DefenderLineEntry = { ...d, currentHp: nextHp };
    nextD = applyRetreatRules(nextD);
    const rep = [...defenderLine];
    rep[di] = nextD;
    defenderLine = rep;
    lines.push({
      turn,
      timestamp: t0,
      text: strike.flags.dodged
        ? `${e.enemyId} lunges at ${d.name} — evaded.`
        : strike.flags.blocked
          ? `${e.enemyId} hits ${d.name} (blocked) for ${String(strike.finalDamage)}.`
          : `${e.enemyId} hits ${d.name} for ${String(strike.finalDamage)}.`,
      type: 'enemy',
    });
  }

  const totalEnemyPoints = sumLivingThreatPoints(enemies);
  let outcome: NightlyDefenseOutcome = daily.outcome;
  let isCompleted = false;
  let phase: DailyDefenseState['phase'] = daily.phase;

  if (breached) {
    outcome = 'breach';
    isCompleted = true;
    phase = 'ended';
    lines.push({
      turn,
      timestamp: Date.now(),
      text: 'The wall gives — city breach!',
      type: 'system',
    });
  } else if (enemies.length === 0) {
    outcome = 'victory';
    isCompleted = true;
    phase = 'ended';
    lines.push({
      turn,
      timestamp: Date.now(),
      text: 'Hostiles routed — perimeter holds.',
      type: 'system',
    });
  }

  const nextDaily: DailyDefenseState = {
    ...daily,
    currentTurn: turn,
    enemies,
    defenderLine,
    totalEnemyPoints,
    combatLog: daily.combatLog,
    outcome,
    isCompleted,
    phase,
    victoryLootPool: daily.victoryLootPool,
  };

  return {
    nextDaily,
    wallResult: { wall: nextWall, breached },
    fightEnded: isCompleted,
    newLogLines: lines,
  };
}

export function buildDefenderLineFromLocks(
  lockedIds: string[],
  getCharacter: (id: string) =>
    | { name: string; health: { current: number; max: number } }
    | undefined,
): DefenderLineEntry[] {
  const out: DefenderLineEntry[] = [];
  for (const id of lockedIds) {
    const ch = getCharacter(id);
    if (!ch) continue;
    out.push({
      characterId: id,
      name: ch.name,
      currentHp: ch.health.current,
      maxHp: ch.health.max,
      retreated: false,
    });
  }
  return out;
}
