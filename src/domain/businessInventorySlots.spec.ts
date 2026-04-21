import { describe, expect, it } from 'vitest';

import { depositIntoBusinessSlots } from './businessInventorySlots.ts';
import type { BusinessInventorySlot } from './types/economy.ts';

describe('businessInventorySlots', () => {
  it('depositIntoBusinessSlots merges same template', () => {
    const slots: BusinessInventorySlot[] = [
      { templateId: 'scrap_metal', quantity: 10 },
      null,
    ];
    const { slots: next, deposited } = depositIntoBusinessSlots(
      slots,
      'scrap_metal',
      5,
    );
    expect(deposited).toBe(5);
    expect(next[0]?.quantity).toBe(15);
  });
});
