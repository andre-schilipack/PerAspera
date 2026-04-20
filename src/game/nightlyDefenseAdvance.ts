import { applyRaidFromRemainingThreat } from '../domain/applyRaid.ts';
import {
  DEFENSE_VICTORY_CREDS,
  DEFENSE_VICTORY_REPUTATION,
  DEFENSE_VICTORY_SCORE,
} from '../domain/constants.ts';
import { sumLivingThreatPoints } from '../domain/enemyThreat.ts';
import { advanceNightlyDefenseRound } from '../domain/nightlyDefenseCombat.ts';
import { advancePrefeituraSiegeRound } from '../domain/prefeituraSiegeCombat.ts';
import {
  distributeItemsAmongParticipants,
} from '../domain/nightlyDefenseLoot.ts';
import type { Character } from '../domain/types/character.ts';
import type { CombatLogEntry } from '../domain/types/combat.ts';
import type { DailyDefenseState, WallState } from '../domain/types/defense.ts';
import type { Item } from '../domain/types/items.ts';
import type { HexMap } from '../domain/types/map.ts';
import type { GameOverReason, NextIdCounters } from '../domain/types/meta.ts';

import { declareGameOver } from './gameOver.ts';

/** Snapshot of stores needed to compute one nightly defense round advance. */
export interface NightlyDefenseAdvanceSnapshot {
  dailyDefense: DailyDefenseState;
  wall: WallState;
  nextCombatLogEntryId: number;
  civilianPopulation: number;
  hexMap: HexMap | null;
}

export interface DefenderHpSyncPayload {
  line: Array<{
    characterId: string;
    currentHp: number;
    maxHp: number;
  }>;
  lastUpdated: number;
}

export interface VictoryRewardDelta {
  characterId: string;
  scoreDelta: number;
  reputationDelta: number;
  credsDelta: number;
}

/**
 * Pure description of store writes after one `advanceNightlyDefenseRound`.
 * Built in the domain; applied in fixed order by {@link applyNightlyDefenseAdvanceCommit}.
 */
export interface NightlyDefenseAdvanceCommit {
  wall: WallState;
  /** Final combat log entry id after all new lines (round + optional raid log). */
  nextCombatLogEntryId: number;
  dailyDefense: DailyDefenseState;
  defenderHpSync?: DefenderHpSyncPayload;
  victoryRewards?: VictoryRewardDelta[];
  /** Random split of {@link DailyDefenseState.victoryLootPool} among defenders. */
  victoryLootGrants?: Array<{ characterId: string; items: Item[] }>;
  /** `skipped` = breach but no hex map (raid not simulated). */
  breachRaid?: { civilianPopulation: number; hexMap: HexMap } | 'skipped';
  /** Prefeitura siege round updates structural HP on Centro (after breach raid map). */
  updatedHexMap?: HexMap;
  /** Terminal state (e.g. Prefeitura siege defeat in P3). Applied last. */
  declareGameOver?: { reason: GameOverReason; at: number };
}

export function buildNightlyDefenseAdvanceCommit(
  snapshot: NightlyDefenseAdvanceSnapshot,
  rng: () => number,
  now: number = Date.now(),
): NightlyDefenseAdvanceCommit {
  const { dailyDefense: dd, wall: w, nextCombatLogEntryId: startId } = snapshot;

  if (
    dd.outcome === 'prefeitura_siege' &&
    dd.phase === 'fighting' &&
    !dd.isCompleted
  ) {
    if (!snapshot.hexMap) {
      let nextId = startId + 1;
      const line: CombatLogEntry = {
        id: nextId,
        turn: dd.currentTurn,
        timestamp: now,
        text: 'Prefeitura siege aborted — city map missing.',
        type: 'system',
      };
      return {
        wall: w,
        nextCombatLogEntryId: nextId,
        dailyDefense: {
          ...dd,
          combatLog: [...dd.combatLog, line],
          outcome: 'loss',
          phase: 'ended',
          isCompleted: true,
        },
        declareGameOver: { reason: 'prefeitura_fallen', at: now },
      };
    }

    const siegeResult = advancePrefeituraSiegeRound(
      dd,
      w,
      snapshot.hexMap,
      rng,
    );
    let nextId = startId;
    const siegeLines: CombatLogEntry[] = siegeResult.newLogLines.map((l) => {
      nextId += 1;
      return { ...l, id: nextId };
    });
    const combatLog = [...dd.combatLog, ...siegeLines];
    const nextDaily: DailyDefenseState = {
      ...siegeResult.nextDaily,
      combatLog,
    };

    const base: NightlyDefenseAdvanceCommit = {
      wall: siegeResult.wallResult.wall,
      nextCombatLogEntryId: nextId,
      dailyDefense: nextDaily,
      updatedHexMap: siegeResult.hexMap,
    };

    if (!siegeResult.fightEnded) {
      return base;
    }

    const defenderHpSync: DefenderHpSyncPayload = {
      line: siegeResult.nextDaily.defenderLine.map((d) => ({
        characterId: d.characterId,
        currentHp: d.currentHp,
        maxHp: d.maxHp,
      })),
      lastUpdated: now,
    };

    if (siegeResult.nextDaily.outcome === 'victory') {
      const participantIds = siegeResult.nextDaily.defenderLine.map(
        (d) => d.characterId,
      );
      const victoryLootGrants = distributeItemsAmongParticipants(
        dd.victoryLootPool,
        participantIds,
        rng,
      );
      return {
        ...base,
        dailyDefense: { ...nextDaily, victoryLootPool: [] },
        defenderHpSync,
        victoryRewards: siegeResult.nextDaily.defenderLine.map((d) => ({
          characterId: d.characterId,
          scoreDelta: DEFENSE_VICTORY_SCORE,
          reputationDelta: DEFENSE_VICTORY_REPUTATION,
          credsDelta: DEFENSE_VICTORY_CREDS,
        })),
        victoryLootGrants,
      };
    }

    if (siegeResult.nextDaily.outcome === 'loss') {
      return {
        ...base,
        dailyDefense: { ...nextDaily, victoryLootPool: [] },
        defenderHpSync,
        declareGameOver: { reason: 'prefeitura_fallen', at: now },
      };
    }

    return {
      ...base,
      dailyDefense: { ...nextDaily, victoryLootPool: [] },
      defenderHpSync,
    };
  }

  const result = advanceNightlyDefenseRound(dd, w, rng);

  let nextId = startId;
  const newLines: CombatLogEntry[] = result.newLogLines.map((l) => {
    nextId += 1;
    return { ...l, id: nextId };
  });
  const combatLog = [...dd.combatLog, ...newLines];
  const nextDaily: DailyDefenseState = { ...result.nextDaily, combatLog };

  const base: NightlyDefenseAdvanceCommit = {
    wall: result.wallResult.wall,
    nextCombatLogEntryId: nextId,
    dailyDefense: nextDaily,
  };

  if (!result.fightEnded) {
    return base;
  }

  const defenderHpSync: DefenderHpSyncPayload = {
    line: result.nextDaily.defenderLine.map((d) => ({
      characterId: d.characterId,
      currentHp: d.currentHp,
      maxHp: d.maxHp,
    })),
    lastUpdated: now,
  };

  if (result.nextDaily.outcome === 'victory') {
    const participantIds = result.nextDaily.defenderLine.map((d) => d.characterId);
    const victoryLootGrants = distributeItemsAmongParticipants(
      dd.victoryLootPool,
      participantIds,
      rng,
    );
    return {
      ...base,
      dailyDefense: { ...nextDaily, victoryLootPool: [] },
      defenderHpSync,
      victoryRewards: result.nextDaily.defenderLine.map((d) => ({
        characterId: d.characterId,
        scoreDelta: DEFENSE_VICTORY_SCORE,
        reputationDelta: DEFENSE_VICTORY_REPUTATION,
        credsDelta: DEFENSE_VICTORY_CREDS,
      })),
      victoryLootGrants,
    };
  }

  if (result.nextDaily.outcome === 'breach') {
    if (!snapshot.hexMap) {
      return {
        ...base,
        dailyDefense: { ...nextDaily, victoryLootPool: [] },
        defenderHpSync,
        breachRaid: 'skipped',
      };
    }

    const threat = sumLivingThreatPoints(result.nextDaily.enemies);
    const raid = applyRaidFromRemainingThreat({
      remainingThreatPoints: threat,
      civilianPopulation: snapshot.civilianPopulation,
      hexMap: snapshot.hexMap,
      rng,
      targetHexId: nextDaily.targetHexId,
    });

    let mergedLog = combatLog;
    for (const text of raid.logLines) {
      nextId += 1;
      mergedLog = [
        ...mergedLog,
        {
          id: nextId,
          turn: nextDaily.currentTurn,
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
      return {
        ...base,
        nextCombatLogEntryId: nextId,
        dailyDefense: {
          ...afterRaidDaily,
          outcome: 'prefeitura_siege',
          phase: 'fighting',
          isCompleted: false,
        },
        defenderHpSync,
        breachRaid: {
          civilianPopulation: raid.civilianPopulation,
          hexMap: raid.hexMap,
        },
      };
    }

    return {
      ...base,
      nextCombatLogEntryId: nextId,
      dailyDefense: afterRaidDaily,
      defenderHpSync,
      breachRaid: {
        civilianPopulation: raid.civilianPopulation,
        hexMap: raid.hexMap,
      },
    };
  }

  return {
    ...base,
    dailyDefense: { ...nextDaily, victoryLootPool: [] },
    defenderHpSync,
  };
}

export interface NightlyDefenseAdvanceCommitApi {
  setWall: (wall: WallState) => void;
  patchNextIds: (patch: Partial<NextIdCounters>) => void;
  setDailyDefense: (daily: DailyDefenseState) => void;
  updateCharacter: (characterId: string, patch: Partial<Character>) => void;
  getCharacter: (characterId: string) => Character | undefined;
  setCivilianPopulation: (n: number) => void;
  setHexMap: (hexMap: HexMap) => void;
  addItemToInventory: (characterId: string, item: Item) => void;
}

/**
 * Fixed order: wall → meta ids → character HP → victory creds → victory loot → raid city/world → daily defense.
 */
export function applyNightlyDefenseAdvanceCommit(
  commit: NightlyDefenseAdvanceCommit,
  api: NightlyDefenseAdvanceCommitApi,
): void {
  api.setWall(commit.wall);
  api.patchNextIds({ combatLogEntry: commit.nextCombatLogEntryId });

  if (commit.defenderHpSync) {
    const { line, lastUpdated } = commit.defenderHpSync;
    for (const d of line) {
      const ch = api.getCharacter(d.characterId);
      if (!ch) continue;
      api.updateCharacter(d.characterId, {
        health: {
          current: Math.min(d.maxHp, Math.max(0, d.currentHp)),
          max: d.maxHp,
          lastUpdated,
        },
      });
    }
  }

  if (commit.victoryRewards) {
    for (const r of commit.victoryRewards) {
      const live = api.getCharacter(r.characterId);
      if (!live) continue;
      api.updateCharacter(r.characterId, {
        score: live.score + r.scoreDelta,
        reputation: live.reputation + r.reputationDelta,
        creds: live.creds + r.credsDelta,
      });
    }
  }

  if (commit.victoryLootGrants) {
    for (const g of commit.victoryLootGrants) {
      for (const item of g.items) {
        api.addItemToInventory(g.characterId, item);
      }
    }
  }

  if (commit.breachRaid && commit.breachRaid !== 'skipped') {
    api.setCivilianPopulation(commit.breachRaid.civilianPopulation);
    api.setHexMap(commit.breachRaid.hexMap);
  }

  if (commit.updatedHexMap) {
    api.setHexMap(commit.updatedHexMap);
  }

  api.setDailyDefense(commit.dailyDefense);

  if (commit.declareGameOver) {
    declareGameOver(commit.declareGameOver.reason, commit.declareGameOver.at);
  }
}
