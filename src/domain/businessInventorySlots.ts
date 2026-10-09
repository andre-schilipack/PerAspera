import type { BusinessInventorySlot } from './types/economy.ts';

/** Max units per slot stack (single-template stacks). */
export const MAX_BUSINESS_SLOT_STACK = 999;

export function createEmptyBusinessInventorySlots(
  count: number,
): BusinessInventorySlot[] {
  return Array.from({ length: count }, (): null => null);
}

/** Pad / trim persisted slot arrays to the catalog storage size. */
export function normalizeBusinessInventorySlots(
  slotCount: number,
  raw: BusinessInventorySlot[] | undefined | null,
): BusinessInventorySlot[] {
  const target = Math.max(0, slotCount);
  if (!raw || raw.length === 0) {
    return createEmptyBusinessInventorySlots(target);
  }
  const cells = raw.map((s) => (s === null ? null : { ...s }));
  if (cells.length === target) return cells;
  if (cells.length < target) {
    return cells.concat(createEmptyBusinessInventorySlots(target - cells.length));
  }
  return cells.slice(0, target);
}

/**
 * Deposit into existing stacks of same template first, then empty slots.
 * Returns how many units were placed (caller removes from character inventory).
 */
export function depositIntoBusinessSlots(
  slots: readonly BusinessInventorySlot[],
  templateId: string,
  qty: number,
): { slots: BusinessInventorySlot[]; deposited: number } {
  if (qty <= 0) {
    return { slots: [...slots], deposited: 0 };
  }

  let remaining = qty;
  let deposited = 0;
  const next = slots.map((s) => (s === null ? null : { ...s }));

  for (let i = 0; i < next.length && remaining > 0; i++) {
    const s = next[i];
    if (s?.templateId === templateId) {
      const room = MAX_BUSINESS_SLOT_STACK - s.quantity;
      const add = Math.min(remaining, room);
      if (add > 0) {
        next[i] = { templateId, quantity: s.quantity + add };
        remaining -= add;
        deposited += add;
      }
    }
  }

  for (let i = 0; i < next.length && remaining > 0; i++) {
    if (next[i] === null) {
      const add = Math.min(remaining, MAX_BUSINESS_SLOT_STACK);
      next[i] = { templateId, quantity: add };
      remaining -= add;
      deposited += add;
    }
  }

  return { slots: next, deposited };
}

/** Remove quantity from slots (left to right), clearing slots that hit zero. */
export function consumeTemplateFromBusinessSlots(
  slots: readonly BusinessInventorySlot[],
  templateId: string,
  qty: number,
): { slots: BusinessInventorySlot[]; consumed: number } {
  if (qty <= 0) {
    return { slots: [...slots], consumed: 0 };
  }
  let left = qty;
  let consumed = 0;
  const next = slots.map((s) => (s === null ? null : { ...s }));

  for (let i = 0; i < next.length && left > 0; i++) {
    const s = next[i];
    if (s?.templateId !== templateId) continue;
    const take = Math.min(s.quantity, left);
    const q = s.quantity - take;
    consumed += take;
    left -= take;
    next[i] = q <= 0 ? null : { templateId, quantity: q };
  }

  return { slots: next, consumed };
}

export function aggregateSlotQuantities(
  slots: readonly BusinessInventorySlot[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of slots) {
    if (!s) continue;
    out[s.templateId] = (out[s.templateId] ?? 0) + s.quantity;
  }
  return out;
}

/** Withdraw up to `qty` from a single slot index into a transfer amount (caller builds Item). */
export function withdrawFromBusinessSlotAt(
  slots: readonly BusinessInventorySlot[],
  slotIndex: number,
  qty: number,
): { slots: BusinessInventorySlot[]; taken: number } {
  if (
    slotIndex < 0 ||
    slotIndex >= slots.length ||
    qty <= 0 ||
    slots[slotIndex] === null
  ) {
    return { slots: [...slots], taken: 0 };
  }
  const s = slots[slotIndex]!;
  const take = Math.min(qty, s.quantity);
  const next = slots.map((cell, i) => {
    if (i !== slotIndex || cell === null) return cell;
    const q = cell.quantity - take;
    return q <= 0 ? null : { templateId: cell.templateId, quantity: q };
  });
  return { slots: next, taken: take };
}
