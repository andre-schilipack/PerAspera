import { useEffect, useRef } from 'react';

import {
  combatActorTag,
  combatBeatPhaseTag,
} from '../content/combatLines.ts';
import type { CombatLogEntry } from '../domain/types/index.ts';

export interface CombatLogListProps {
  entries: readonly CombatLogEntry[];
  /** Extra class on the scroll container (e.g. height tweaks). */
  className?: string;
  emptyLabel?: string;
  /** Scroll newest line into view when entries grow. */
  autoScroll?: boolean;
}

/**
 * Styled combat log: one row per entry, color by {@link CombatLogEntry.type}.
 */
export function CombatLogList({
  entries,
  className = '',
  emptyLabel = '—',
  autoScroll = true,
}: CombatLogListProps) {
  const bottomRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!autoScroll || entries.length === 0) return;
    bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [entries.length, autoScroll]);

  if (entries.length === 0) {
    return (
      <p className="game-combat-log-empty game-muted">{emptyLabel}</p>
    );
  }

  return (
    <ul
      className={`game-combat-log ${className}`.trim()}
      aria-label="Combat log"
    >
      {entries.map((e, i) => (
        <li
          key={e.id}
          ref={i === entries.length - 1 ? bottomRef : undefined}
          className={`game-combat-log__line${e.highlight ? ' game-combat-log__line--highlight' : ''}`.trim()}
          data-actor={e.type}
          data-beat={e.combatBeatPhase ?? undefined}
          data-highlight={e.highlight ? 'true' : undefined}
        >
          <span className="game-combat-log__meta" aria-hidden="true">
            <span className="game-combat-log__tag">
              {combatActorTag(e.type)}
            </span>
            {e.combatBeatPhase ? (
              <span className="game-combat-log__beat" title="Tactical beat">
                {combatBeatPhaseTag(e.combatBeatPhase)}
              </span>
            ) : null}
            <span className="game-combat-log__turn">T{e.turn}</span>
          </span>
          <span className="game-combat-log__text">{e.text}</span>
        </li>
      ))}
    </ul>
  );
}
