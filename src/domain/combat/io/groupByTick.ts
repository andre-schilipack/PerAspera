import type { CanonicalEvent } from '../core/events.ts';

export interface CanonicalEventTickGroup {
  tick: number;
  events: CanonicalEvent[];
}

/** Group canonical events by `t`, preserving order within each tick. */
export function groupCanonicalEventsByTick(
  events: readonly CanonicalEvent[],
): CanonicalEventTickGroup[] {
  const byTick = new Map<number, CanonicalEvent[]>();
  for (const e of events) {
    const arr = byTick.get(e.t);
    if (arr) arr.push(e);
    else byTick.set(e.t, [e]);
  }
  return [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, group]) => ({ tick, events: group }));
}
