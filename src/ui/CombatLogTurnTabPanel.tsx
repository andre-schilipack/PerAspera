import { useMemo, useState } from 'react';

import { formatCombatClock } from '../domain/combat/io/combatClock.ts';
import type { CombatLogEntry } from '../domain/types/index.ts';

import { CombatLogList } from './CombatLogList.tsx';

export type CombatLogTurnSelection = 'all' | number;

export interface CombatLogTurnTabPanelProps {
  /** Full merged log (all encounters / phases) — drives which turn tabs exist. */
  fullLog: readonly CombatLogEntry[];
  /** Subset to render (e.g. reveal pacing); still filtered by selected turn tab. */
  visibleEntries: readonly CombatLogEntry[];
  /** Reset tab selection to "All" when the fight session changes. */
  resetKey: string;
  className?: string;
  listClassName?: string;
  autoScroll?: boolean;
  emptyLabel?: string;
}

/**
 * Single combat feed with timeline tabs. `CombatLogEntry.turn` is the combat tick.
 * Tabs show fight time (1 tick = 0.1s). "All" shows the visible stream.
 */
export function CombatLogTurnTabPanel({
  fullLog,
  visibleEntries,
  resetKey,
  className = '',
  listClassName = '',
  autoScroll = true,
  emptyLabel = '—',
}: CombatLogTurnTabPanelProps) {
  const [selectionState, setSelectionState] = useState<{
    resetKey: string;
    selected: CombatLogTurnSelection;
  }>({ resetKey, selected: 'all' });
  const selected =
    selectionState.resetKey === resetKey ? selectionState.selected : 'all';

  function setSelected(next: CombatLogTurnSelection): void {
    setSelectionState({ resetKey, selected: next });
  }

  const turnNumbers = useMemo(() => {
    const s = new Set(fullLog.map((e) => e.turn));
    return [...s].sort((a, b) => a - b);
  }, [fullLog]);

  const displayed = useMemo(() => {
    if (selected === 'all') return visibleEntries;
    return visibleEntries.filter((e) => e.turn === selected);
  }, [visibleEntries, selected]);

  return (
    <div className={`game-combat-log-panel ${className}`.trim()}>
      <div
        className="game-combat-log-tabs"
        role="tablist"
        aria-label="Combat timeline"
      >
        <button
          type="button"
          className="game-combat-log-tab"
          role="tab"
          aria-selected={selected === 'all'}
          data-active={selected === 'all' ? 'true' : 'false'}
          onClick={() => setSelected('all')}
        >
          All
        </button>
        {turnNumbers.map((t) => (
          <button
            key={t}
            type="button"
            className="game-combat-log-tab"
            role="tab"
            aria-selected={selected === t}
            data-active={selected === t ? 'true' : 'false'}
            onClick={() => setSelected(t)}
          >
            {formatCombatClock(t)}
          </button>
        ))}
      </div>
      <CombatLogList
        entries={displayed}
        className={listClassName}
        autoScroll={autoScroll}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}
