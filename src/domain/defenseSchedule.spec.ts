import { describe, expect, it } from 'vitest';

import {
  addLocalCalendarDays,
  compareIsoDateString,
  localDateTimeMs,
} from './defenseSchedule.ts';

describe('defenseSchedule calendar helpers', () => {
  it('compareIsoDateString orders YYYY-MM-DD lexicographically', () => {
    expect(compareIsoDateString('2026-04-01', '2026-04-03')).toBeLessThan(0);
    expect(compareIsoDateString('2026-04-03', '2026-04-03')).toBe(0);
    expect(compareIsoDateString('2027-01-01', '2026-12-31')).toBeGreaterThan(0);
  });

  it('addLocalCalendarDays crosses month boundaries', () => {
    expect(addLocalCalendarDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addLocalCalendarDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('localDateTimeMs matches local wall time', () => {
    const ms = localDateTimeMs('2026-06-15', 20, 30, 0);
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(20);
    expect(d.getMinutes()).toBe(30);
  });
});
