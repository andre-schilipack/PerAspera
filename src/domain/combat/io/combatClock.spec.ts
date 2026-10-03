import { describe, expect, it } from 'vitest';

import { COMBAT_TICK_SECONDS, formatCombatClock } from './combatClock.ts';

describe('combat clock', () => {
  it('treats one tick as 0.1 seconds', () => {
    expect(COMBAT_TICK_SECONDS).toBe(0.1);
    expect(formatCombatClock(0)).toBe('0.0s');
    expect(formatCombatClock(10)).toBe('1.0s');
    expect(formatCombatClock(23)).toBe('2.3s');
  });
});
