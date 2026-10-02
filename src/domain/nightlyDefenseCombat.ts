import type { CombatLogEntry } from './types/combat.ts';
import type { CoreAttributes } from './types/attributes.ts';
import type { DailyDefenseState, DefenderLineEntry } from './types/defense.ts';
import type { MoveTemplateId } from './types/combat.ts';
import type { MassCombatWallSnapshot } from './types/massCombat.ts';
import { defenderBucketForLineIndex } from './defenseTactics.ts';
import type { HexMap } from './types/map.ts';
import { resolveDefenseFieldBattle } from './defenseFieldBattle.ts';

export type NightlyCombatWallResult = MassCombatWallSnapshot;

export interface AdvanceNightlyDefenseResult {
  nextDaily: DailyDefenseState;
  wallResult: NightlyCombatWallResult;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
}

/**
 * Perimeter encounter — one `simulateBattle` (warriors, tower, guards vs the wave).
 * A lost field zeroes the sector wall and reports breach. Spirit/morale are not part of this fight.
 */
export function advanceNightlyDefenseRound(
  daily: DailyDefenseState,
  hexMap: HexMap,
  rng: () => number = Math.random,
): AdvanceNightlyDefenseResult {
  const resolved = resolveDefenseFieldBattle({
    daily,
    hexMap,
    theater: 'wall',
    rng,
  });
  return {
    nextDaily: resolved.nextDaily,
    wallResult: resolved.wallResult,
    fightEnded: resolved.fightEnded,
    newLogLines: resolved.newLogLines,
  };
}

export function buildDefenderLineFromLocks(
  lockedIds: string[],
  getCharacter: (id: string) =>
    | {
        name: string;
        health: { current: number; max: number };
        coreAttributes?: CoreAttributes;
        combatLoadout?: { skillIds: readonly MoveTemplateId[] };
      }
    | undefined,
): DefenderLineEntry[] {
  const out: DefenderLineEntry[] = [];
  for (const id of lockedIds) {
    const ch = getCharacter(id);
    if (!ch) continue;
    const skillIds =
      ch.combatLoadout?.skillIds != null && ch.combatLoadout.skillIds.length > 0
        ? [...ch.combatLoadout.skillIds]
        : undefined;
    out.push({
      characterId: id,
      name: ch.name,
      currentHp: ch.health.current,
      maxHp: ch.health.max,
      retreated: false,
      tacticalBucket: defenderBucketForLineIndex(out.length),
      coreAttributes:
        ch.coreAttributes !== undefined ? { ...ch.coreAttributes } : undefined,
      skillIds,
      combatState: { cooldowns: {}, statuses: {} },
    });
  }
  return out;
}
