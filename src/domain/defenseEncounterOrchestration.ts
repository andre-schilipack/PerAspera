import { applyRaidFromRemainingThreat } from './applyRaid.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import type { CombatLogEntry } from './types/combat.ts';
import type { DailyDefenseState } from './types/defense.ts';
import type { HexMap } from './types/map.ts';

/**
 * Immutable snapshot after the **wall** encounter ends in a **breach** (encounter 1),
 * before raid march and optional **Prefeitura siege** (encounter 2).
 * `combatLog` inside `dailyDefense` is the unified log so far.
 */
export interface WallBreachHandoffSnapshot {
  readonly dailyDefense: DailyDefenseState;
  readonly nextCombatLogEntryId: number;
}

/**
 * Captures the wall-phase terminal state. Call this when
 * `dailyDefense.outcome === 'breach'` after merging round lines into the log.
 */
export function createWallBreachHandoffSnapshot(
  dailyDefense: DailyDefenseState,
  nextCombatLogEntryId: number,
): WallBreachHandoffSnapshot {
  return { dailyDefense, nextCombatLogEntryId };
}

export interface OpenPrefeituraPhaseAfterWallBreachInput {
  snapshot: WallBreachHandoffSnapshot;
  /** When null, raid + downtown siege are skipped (keeps breach terminal state in caller). */
  hexMap: HexMap | null;
  civilianPopulation: number;
  targetHexId: string;
  rng: () => number;
  now: number;
}

export interface OpenPrefeituraPhaseAfterWallBreachResult {
  dailyDefense: DailyDefenseState;
  nextCombatLogEntryId: number;
  breachRaid:
    | { civilianPopulation: number; hexMap: HexMap }
    | 'skipped';
}

/**
 * **Encounter 2 setup** from the wall-breach snapshot: run post-breach raid, merge log lines,
 * and if hostiles remain, re-open `DailyDefenseState` for `outcome: 'prefeitura_siege'`
 * (unified `combatLog` preserved; subsequent rounds use {@link advancePrefeituraSiegeRound}).
 */
export function openPrefeituraPhaseAfterWallBreach(
  input: OpenPrefeituraPhaseAfterWallBreachInput,
): OpenPrefeituraPhaseAfterWallBreachResult {
  const { snapshot, hexMap, civilianPopulation, targetHexId, rng, now } = input;
  const nextDaily = snapshot.dailyDefense;
  let nextId = snapshot.nextCombatLogEntryId;

  if (!hexMap) {
    return {
      dailyDefense: { ...nextDaily, victoryLootPool: [] },
      nextCombatLogEntryId: nextId,
      breachRaid: 'skipped',
    };
  }

  const threat = sumLivingThreatPoints(nextDaily.enemies);
  const raid = applyRaidFromRemainingThreat({
    remainingThreatPoints: threat,
    civilianPopulation,
    hexMap,
    rng,
    targetHexId,
  });

  let mergedLog: CombatLogEntry[] = nextDaily.combatLog;
  const raidTick = nextDaily.combatLog.reduce(
    (latest, entry) => Math.max(latest, entry.turn),
    0,
  );
  for (const text of raid.logLines) {
    nextId += 1;
    mergedLog = [
      ...mergedLog,
      {
        id: nextId,
        turn: raidTick,
        timestamp: now,
        text,
        type: 'system',
      },
    ];
  }

  const afterRaidDaily: DailyDefenseState = {
    ...nextDaily,
    combatLog: mergedLog,
    victoryLootPool: [],
  };
  const threatPts = sumLivingThreatPoints(afterRaidDaily.enemies);

  if (threatPts > 0) {
    const defenderLineLastStand = afterRaidDaily.defenderLine.map((d) =>
      d.currentHp > 0 ? { ...d, retreated: false } : d,
    );
    return {
      dailyDefense: {
        ...afterRaidDaily,
        outcome: 'prefeitura_siege',
        phase: 'fighting',
        isCompleted: false,
        defenderLine: defenderLineLastStand,
      },
      nextCombatLogEntryId: nextId,
      breachRaid: {
        civilianPopulation: raid.civilianPopulation,
        hexMap: raid.hexMap,
      },
    };
  }

  return {
    dailyDefense: afterRaidDaily,
    nextCombatLogEntryId: nextId,
    breachRaid: {
      civilianPopulation: raid.civilianPopulation,
      hexMap: raid.hexMap,
    },
  };
}
