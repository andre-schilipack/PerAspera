/**
 * Local calendar helpers for daily defense reset and the 20:00 window.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `YYYY-MM-DD` in the user's local timezone. */
export function formatLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

/** True if both instants fall on the same local calendar day. */
export function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return formatLocalDateString(a) === formatLocalDateString(b);
}

/**
 * True when local time is at or after `startHour` (e.g. 20 for 20:00)
 * and before midnight (same calendar day).
 */
export function isDefenseWindowActive(
  date: Date,
  startHour: number,
): boolean {
  return date.getHours() >= startHour;
}

/**
 * Minutes from `date` until local `startHour`:00 on the same day, or 0 if already passed.
 */
export function minutesUntilDefenseStartToday(
  date: Date,
  startHour: number,
): number {
  const target = new Date(date);
  target.setHours(startHour, 0, 0, 0);
  const diffMs = target.getTime() - date.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 60_000);
}

/** Lexicographic compare for `YYYY-MM-DD` strings (local calendar labels). */
export function compareIsoDateString(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Local midnight → next calendar day as `YYYY-MM-DD`. */
export function addLocalCalendarDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return formatLocalDateString(dt);
}

/** Milliseconds for local date `YYYY-MM-DD` at `hour`:`minute`:`second`. */
export function localDateTimeMs(
  dateStr: string,
  hour: number,
  minute = 0,
  second = 0,
): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, second, 0).getTime();
}
