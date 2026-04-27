import { useCallback, useEffect, useRef, useState } from 'react';

import type { CombatLogEntry } from '../domain/types/index.ts';

export interface UseCombatLogRevealResult {
  visibleEntries: CombatLogEntry[];
  pendingApprox: number;
  flushPending: () => void;
}

/**
 * Reveals combat log lines one-by-one for race-like pacing. Resets when
 * `sessionKey` changes (new fight / night).
 */
export function useCombatLogReveal(
  entries: readonly CombatLogEntry[],
  sessionKey: string,
  delayMs: number,
): UseCombatLogRevealResult {
  const [visibleState, setVisibleState] = useState<{
    sessionKey: string;
    entries: CombatLogEntry[];
  }>({ sessionKey, entries: [] });
  const visibleEntries =
    visibleState.sessionKey === sessionKey ? visibleState.entries : [];
  const queueRef = useRef<CombatLogEntry[]>([]);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const sessionRef = useRef(sessionKey);

  useEffect(() => {
    if (sessionRef.current === sessionKey) return;
    sessionRef.current = sessionKey;
    seenIdsRef.current = new Set();
    queueRef.current = [];
  }, [sessionKey]);

  useEffect(() => {
    for (const e of entries) {
      if (!seenIdsRef.current.has(e.id)) {
        seenIdsRef.current.add(e.id);
        queueRef.current.push(e);
      }
    }
  }, [entries]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (queueRef.current.length === 0) return;
      const next = queueRef.current.shift();
      if (next) {
        setVisibleState((prev) => ({
          sessionKey,
          entries:
            prev.sessionKey === sessionKey ? [...prev.entries, next] : [next],
        }));
      }
    }, delayMs);
    return () => window.clearInterval(id);
  }, [sessionKey, delayMs]);

  const flushPending = useCallback(() => {
    const rest = queueRef.current.splice(0, queueRef.current.length);
    if (rest.length === 0) return;
    setVisibleState((prev) => ({
      sessionKey,
      entries:
        prev.sessionKey === sessionKey ? [...prev.entries, ...rest] : rest,
    }));
  }, [sessionKey]);

  const pendingApprox = Math.max(0, entries.length - visibleEntries.length);

  return { visibleEntries, pendingApprox, flushPending };
}
