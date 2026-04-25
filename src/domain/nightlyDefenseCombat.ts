import type { CombatLogEntry } from './types/combat.ts';
import type { CoreAttributes } from './types/attributes.ts';
import type {
  DailyDefenseState,
  DefenderLineEntry,
} from './types/defense.ts';
import type { MoveTemplateId } from './types/combat.ts';
import {
  massCombatStructuralPresenceNightlyWall,
  type MassCombatStructuralPresence,
  type MassCombatWallSnapshot,
} from './types/massCombat.ts';
import { advanceEncounterCombatRound } from './encounterCombat.ts';
import { applyEncounterCombatRoundToDaily } from './encounterCombatSessionMerge.ts';
import { normalizeMassDefenseDefenderLine } from './encounterCombatRound.ts';
import {
  defenderBucketForLineIndex,
} from './defenseTactics.ts';
import type { HexMap } from './types/map.ts';

/** Theater for nightly wall combat — structural + ally strike cycle (see mass combat types). */
export const NIGHTLY_DEFENSE_STRUCTURAL_PRESENCE: MassCombatStructuralPresence =
  massCombatStructuralPresenceNightlyWall();

export type NightlyCombatWallResult = MassCombatWallSnapshot;

export interface AdvanceNightlyDefenseResult {
  nextDaily: DailyDefenseState;
  wallResult: NightlyCombatWallResult;
  fightEnded: boolean;
  newLogLines: Omit<CombatLogEntry, 'id'>[];
}

function defaultRng(): number {
  return Math.random();
}

/**
 * **Encounter 1 (perimeter wall)** — one full round: tower + guards + player line,
 * then living enemies strike. Delegates to `advanceEncounterCombatRound` (`nightly_wall`).
 * On breach, `openPrefeituraPhaseAfterWallBreach` may open encounter 2 (Prefeitura siege)
 * with a unified combat log.
 */
export function advanceNightlyDefenseRound(
  daily: DailyDefenseState,
  hexMap: HexMap,
  rng: () => number = defaultRng,
): AdvanceNightlyDefenseResult {
  const noop: AdvanceNightlyDefenseResult = {
    nextDaily: daily,
    wallResult: { breached: false },
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
    const roundTs = Date.now();
    return {
      nextDaily: {
        ...daily,
        isCompleted: true,
        phase: 'ended',
        outcome: 'victory',
        victoryLootPool: daily.victoryLootPool,
      },
      wallResult: { breached: false },
      fightEnded: true,
      newLogLines: [
        {
          turn: daily.currentTurn,
          timestamp: roundTs,
          text: 'No hostiles — defense stands down.',
          type: 'system',
        },
      ],
    };
  }

  const preparedLine = normalizeMassDefenseDefenderLine(daily.defenderLine);

  const r = advanceEncounterCombatRound({
    rng,
    allies: preparedLine,
    enemies: daily.enemies,
    alliedStructures: [{ type: 'wall', hexId: daily.targetHexId }],
    structures: { hexMap },
    continuation: {
      currentTurn: daily.currentTurn,
      outcome: daily.outcome,
      phase: daily.phase,
      allySpirit: daily.allySpirit,
      moraleShockTurnsRemaining: daily.moraleShockTurnsRemaining,
      wallHexFallback: daily.targetHexId,
    },
  });

  return {
    nextDaily: applyEncounterCombatRoundToDaily(daily, r.stateDelta),
    wallResult: r.wallResult,
    fightEnded: r.fightEnded,
    newLogLines: r.newLogLines,
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
        ch.coreAttributes !== undefined
          ? { ...ch.coreAttributes }
          : undefined,
      skillIds,
    });
  }
  return out;
}
