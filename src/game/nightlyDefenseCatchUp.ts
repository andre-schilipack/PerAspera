import { DEFENSE_START_HOUR } from '../domain/constants.ts';
import { rollDailyDefenseStateForNewDay } from '../domain/factories/createDefenseSeed.ts';
import {
  addLocalCalendarDays,
  compareIsoDateString,
  formatLocalDateString,
  localDateTimeMs,
} from '../domain/defenseSchedule.ts';
import { buildDefenderLineFromLocks } from '../domain/nightlyDefenseCombat.ts';
import { applyAutoEnlistLocksForDefense } from './applyAutoEnlistLocksForDefense.ts';
import { applyCharacterRegenUpTo } from './applyCharacterRegenUpTo.ts';
import {
  applyNightlyDefenseAdvanceCommit,
  buildNightlyDefenseAdvanceCommit,
} from './nightlyDefenseAdvance.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

import type { DefenseCatchUpNightRow } from '../domain/types/defense.ts';

const MAX_FAST_FORWARD_ROUNDS = 8000;

export interface NightlyDefenseCatchUpResult {
  /** Nights fully simulated (historical gap + optional same-day overdue). */
  nightsProcessed: number;
  abortedOnGameOver: boolean;
  /** One row per simulated night (for aggregated catch-up UI). */
  nightSummaries: DefenseCatchUpNightRow[];
}

function buildAdvanceSnapshot(): Parameters<typeof buildNightlyDefenseAdvanceCommit>[0] {
  return {
    dailyDefense: useDefenseStore.getState().dailyDefense,
    wall: useDefenseStore.getState().wall,
    nextCombatLogEntryId: useMetaStore.getState().nextIds.combatLogEntry,
    civilianPopulation: useCityStore.getState().civilianPopulation,
    hexMap: useWorldStore.getState().hexMap,
  };
}

function fastForwardCombatToEnd(rng: () => number, simNow: number): void {
  for (let i = 0; i < MAX_FAST_FORWARD_ROUNDS; i++) {
    const commit = buildNightlyDefenseAdvanceCommit(
      buildAdvanceSnapshot(),
      rng,
      simNow,
    );
    applyNightlyDefenseAdvanceCommit(commit, {
      setWall: (wall) => useDefenseStore.getState().setWall(wall),
      patchNextIds: useMetaStore.getState().patchNextIds,
      setDailyDefense: (dailyDefense) =>
        useDefenseStore.getState().setDailyDefense(dailyDefense),
      updateCharacter: useCharactersStore.getState().updateCharacter,
      getCharacter: (id) => useCharactersStore.getState().characters[id],
      setCivilianPopulation: useCityStore.getState().setCivilianPopulation,
      setHexMap: useWorldStore.getState().setHexMap,
      addItemToInventory: useCharactersStore.getState().addItemToInventory,
    });
    const dd = useDefenseStore.getState().dailyDefense;
    if (dd.isCompleted || useMetaStore.getState().gameOver) {
      return;
    }
  }
}

function transitionIdleToFighting(simNow: number): void {
  applyAutoEnlistLocksForDefense(simNow);
  const ddAfter = useDefenseStore.getState().dailyDefense;
  const chars = useCharactersStore.getState().characters;
  const lockedIds = Object.keys(ddAfter.isLocked).filter(
    (id) => ddAfter.isLocked[id],
  );
  const line = buildDefenderLineFromLocks(lockedIds, (id) => chars[id]);
  useDefenseStore.getState().patchDailyDefense({
    phase: 'fighting',
    defenderLine: line,
  });
}

function simulateIncompleteNight(rng: () => number, defenseInstant: number): void {
  let dd = useDefenseStore.getState().dailyDefense;

  if (dd.enemies.length === 0) {
    useDefenseStore.getState().patchDailyDefense({
      isCompleted: true,
      phase: 'ended',
      outcome: 'victory',
    });
    return;
  }

  if (dd.phase === 'preparing') {
    useDefenseStore.getState().patchDailyDefense({ phase: 'fighting' });
  }

  dd = useDefenseStore.getState().dailyDefense;

  if (dd.phase === 'fighting') {
    fastForwardCombatToEnd(rng, defenseInstant);
    return;
  }

  if (dd.phase === 'idle') {
    transitionIdleToFighting(defenseInstant);
    fastForwardCombatToEnd(rng, defenseInstant);
  }
}

/**
 * Offline catch-up: simulates missed calendar nights (regen → lock → fast-forward combat),
 * advances `dailyDefense.date` until caught up to today, then optionally resolves same-day
 * overdue night when local time is past defense hour.
 */
export function runNightlyDefenseCatchUp(nowMs: number): NightlyDefenseCatchUpResult {
  const rng = Math.random;
  const todayStr = formatLocalDateString(new Date(nowMs));
  let nightsProcessed = 0;
  const nightSummaries: DefenseCatchUpNightRow[] = [];
  let guard = 0;

  function pushNightSummaryFromStore(): void {
    const live = useDefenseStore.getState().dailyDefense;
    nightSummaries.push({
      date: live.date,
      gameDayIndex: live.gameDayIndex,
      outcome: live.outcome,
    });
  }

  while (
    !useMetaStore.getState().gameOver &&
    compareIsoDateString(
      useDefenseStore.getState().dailyDefense.date,
      todayStr,
    ) < 0 &&
    guard < 4000
  ) {
    guard += 1;
    let dd = useDefenseStore.getState().dailyDefense;
    const defenseInstant = localDateTimeMs(dd.date, DEFENSE_START_HOUR);

    applyCharacterRegenUpTo(defenseInstant);

    dd = useDefenseStore.getState().dailyDefense;

    if (dd.isCompleted || dd.phase === 'ended') {
      const nextDate = addLocalCalendarDays(dd.date, 1);
      const nextInstant = localDateTimeMs(nextDate, DEFENSE_START_HOUR);
      applyCharacterRegenUpTo(nextInstant);
      useDefenseStore.getState().setDailyDefense(
        rollDailyDefenseStateForNewDay({
          date: nextDate,
          gameDayIndex: dd.gameDayIndex + 1,
          startHour: dd.startHour,
          rng,
          hexMap: useWorldStore.getState().hexMap ?? undefined,
        }),
      );
      continue;
    }

    simulateIncompleteNight(rng, defenseInstant);
    nightsProcessed += 1;
    pushNightSummaryFromStore();
  }

  if (!useMetaStore.getState().gameOver) {
    const dd = useDefenseStore.getState().dailyDefense;
    const defenseInstant = localDateTimeMs(todayStr, DEFENSE_START_HOUR);
    if (
      dd.date === todayStr &&
      nowMs >= defenseInstant &&
      !dd.isCompleted &&
      dd.enemies.length > 0
    ) {
      applyCharacterRegenUpTo(defenseInstant);
      const live = useDefenseStore.getState().dailyDefense;
      if (!(live.isCompleted || live.phase === 'ended')) {
        simulateIncompleteNight(rng, defenseInstant);
        nightsProcessed += 1;
        pushNightSummaryFromStore();
      }
    }
  }

  return {
    nightsProcessed,
    abortedOnGameOver: useMetaStore.getState().gameOver,
    nightSummaries,
  };
}
