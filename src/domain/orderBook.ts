import type { PassiveItemBuffer } from './types/economy.ts';

export type OrderSide = 'buy' | 'sell';

export interface MarketOrder {
  id: string;
  side: OrderSide;
  templateId: string;
  /** Creds per unit. */
  unitPrice: number;
  quantity: number;
  ownerId: string;
  createdAt: number;
}

export interface OrderFill {
  templateId: string;
  quantity: number;
  unitPrice: number;
  buyerId: string;
  sellerId: string;
}

export interface PlaceOrderResult {
  orders: MarketOrder[];
  fills: OrderFill[];
  /** Quantity that did not fill and was not rested (invalid input). */
  rejected: number;
  /** Creds to return to a buyer who filled below their limit, or unused reservation. */
  credsRefund: number;
  /** Creds paid to sellers, keyed by owner id. Prefeitura fills do not pay a character. */
  credsToSeller: Record<string, number>;
  /** Items delivered to buyers. Prefeitura fills belong in the pantry. */
  itemsToBuyer: { ownerId: string; templateId: string; quantity: number }[];
}

function sortRests(orders: MarketOrder[], side: OrderSide): MarketOrder[] {
  return orders
    .filter((o) => o.side === side && o.quantity > 0)
    .slice()
    .sort((a, b) => {
      if (a.unitPrice !== b.unitPrice) {
        return side === 'buy' ? b.unitPrice - a.unitPrice : a.unitPrice - b.unitPrice;
      }
      return a.createdAt - b.createdAt;
    });
}

/**
 * Match `incoming` against the book. Price first, then earlier `createdAt`.
 * A sell fills the highest bid at or above its limit. A buy fills the lowest
 * ask at or below its limit. The resting order's price is the fill price.
 * Unfilled quantity rests on the book.
 */
export function placeOrder(
  book: readonly MarketOrder[],
  incoming: MarketOrder,
): PlaceOrderResult {
  if (incoming.quantity <= 0 || incoming.unitPrice <= 0) {
    return {
      orders: [...book],
      fills: [],
      rejected: Math.max(0, incoming.quantity),
      credsRefund: 0,
      credsToSeller: {},
      itemsToBuyer: [],
    };
  }

  const orders = book.map((o) => ({ ...o }));
  const fills: OrderFill[] = [];
  const credsToSeller: Record<string, number> = {};
  const itemsToBuyer: PlaceOrderResult['itemsToBuyer'] = [];
  let left = incoming.quantity;
  let spent = 0;

  const rests = sortRests(
    orders,
    incoming.side === 'sell' ? 'buy' : 'sell',
  ).filter((o) => o.templateId === incoming.templateId);

  for (const rest of rests) {
    if (left <= 0) break;
    const crosses =
      incoming.side === 'sell'
        ? rest.unitPrice + 0.000_001 >= incoming.unitPrice
        : rest.unitPrice <= incoming.unitPrice + 0.000_001;
    if (!crosses) continue;
    const qty = Math.min(left, rest.quantity);
    if (qty <= 0) continue;
    rest.quantity -= qty;
    left -= qty;
    const buyerId = incoming.side === 'buy' ? incoming.ownerId : rest.ownerId;
    const sellerId = incoming.side === 'sell' ? incoming.ownerId : rest.ownerId;
    fills.push({
      templateId: incoming.templateId,
      quantity: qty,
      unitPrice: rest.unitPrice,
      buyerId,
      sellerId,
    });
    credsToSeller[sellerId] = (credsToSeller[sellerId] ?? 0) + qty * rest.unitPrice;
    itemsToBuyer.push({ ownerId: buyerId, templateId: incoming.templateId, quantity: qty });
    spent += qty * rest.unitPrice;
  }

  const next = orders.filter((o) => o.quantity > 0);
  if (left > 0) {
    next.push({ ...incoming, quantity: left });
  }

  const reserved = incoming.side === 'buy' ? incoming.quantity * incoming.unitPrice : 0;
  // Resting buy keeps its reservation. Refund only the price improvement on fills,
  // not the unfilled remainder (that cred stays reserved at the limit price).
  const unfilledReserve = left * incoming.unitPrice;
  const refund = incoming.side === 'buy' ? reserved - spent - unfilledReserve : 0;

  return {
    orders: next,
    fills,
    rejected: 0,
    credsRefund: Math.max(0, refund),
    credsToSeller,
    itemsToBuyer,
  };
}

export function cancelOrder(
  book: readonly MarketOrder[],
  orderId: string,
  ownerId: string,
): { orders: MarketOrder[]; released: MarketOrder | null } {
  const found = book.find((o) => o.id === orderId && o.ownerId === ownerId);
  if (!found) return { orders: [...book], released: null };
  return {
    orders: book.filter((o) => o.id !== orderId),
    released: found,
  };
}

/** Drop resting Prefeitura bids for a template so a new daily bid replaces them. */
export function pullOwnerOrders(
  book: readonly MarketOrder[],
  ownerId: string,
  templateId: string,
): { orders: MarketOrder[]; released: MarketOrder[] } {
  const released = book.filter(
    (o) => o.ownerId === ownerId && o.templateId === templateId && o.side === 'buy',
  );
  return {
    orders: book.filter((o) => !released.includes(o)),
    released,
  };
}

export function mergePantry(base: PassiveItemBuffer, add: PassiveItemBuffer): PassiveItemBuffer {
  const next = { ...base };
  for (const [id, qty] of Object.entries(add)) {
    if (qty <= 0) continue;
    next[id] = (next[id] ?? 0) + qty;
  }
  return next;
}
