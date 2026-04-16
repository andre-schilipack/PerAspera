import { DEFENSE_LOCK_STA_COST } from '../domain/constants.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';

/**
 * For characters with auto-enlist ON (default), not yet locked tonight: debit STA and
 * mark daily defense lock — same bookkeeping as manual Lock. Call immediately before
 * auto-start or manual Start nightly defense.
 */
export function applyAutoEnlistLocksForDefense(nowMs: number): void {
  const { dailyDefense: dd, patchDailyDefense } = useDefenseStore.getState();
  if (dd.phase !== 'idle' || dd.isCompleted || dd.enemies.length === 0) {
    return;
  }

  const { characters, updateCharacter } = useCharactersStore.getState();
  const isLocked = { ...dd.isLocked };
  const lockedAt = { ...dd.lockedAt };
  const enlistedForDate = { ...dd.enlistedForDate };
  let defensePatchNeeded = false;

  for (const id of Object.keys(characters)) {
    if (isLocked[id]) continue;
    const ch = characters[id]!;
    const autoOn = ch.autoEnlistNightlyDefense ?? true;
    if (!autoOn) continue;
    if (ch.stamina.current < DEFENSE_LOCK_STA_COST) continue;

    updateCharacter(id, {
      stamina: {
        ...ch.stamina,
        current: ch.stamina.current - DEFENSE_LOCK_STA_COST,
        lastUpdated: nowMs,
      },
    });
    isLocked[id] = true;
    lockedAt[id] = nowMs;
    enlistedForDate[id] = dd.date;
    defensePatchNeeded = true;
  }

  if (defensePatchNeeded) {
    patchDailyDefense({
      isLocked,
      lockedAt,
      enlistedForDate,
    });
  }
}
