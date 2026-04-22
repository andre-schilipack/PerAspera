import { describe, expect, it } from 'vitest';

import {
  COMBAT_UI_LOG_LINE_MS,
  COMBAT_UI_ROUND_INTERVAL_MS,
} from '../domain/constants.ts';

describe('combat UI pacing smoke (bindings used by GameApp)', () => {
  it('keeps round cadence slower than single log line pacing', () => {
    expect(COMBAT_UI_ROUND_INTERVAL_MS).toBeGreaterThan(0);
    expect(COMBAT_UI_LOG_LINE_MS).toBeGreaterThan(0);
    expect(COMBAT_UI_ROUND_INTERVAL_MS).toBeGreaterThan(COMBAT_UI_LOG_LINE_MS);
  });
});
