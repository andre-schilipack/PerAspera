import { normalizeBusiness } from './businessEconomyTick.ts';
import type { Business } from './types/economy.ts';

export interface ItemClaimChunk {
  templateId: string;
  quantity: number;
}

/** Move floored stock from passive buffers into claimable chunks. */
export function claimFromBusinessBuffers(business: Business): {
  business: Business;
  items: ItemClaimChunk[];
} {
  const b0 = normalizeBusiness(business);
  const items: ItemClaimChunk[] = [];
  const passiveItemBuffer = { ...b0.passiveItemBuffer };

  for (const [templateId, qty] of Object.entries(passiveItemBuffer)) {
    const take = Math.floor(qty);
    if (take <= 0) continue;
    const nextQty = qty - take;
    if (nextQty <= 0.000_001) delete passiveItemBuffer[templateId];
    else passiveItemBuffer[templateId] = nextQty;
    items.push({ templateId, quantity: take });
  }

  return {
    business: { ...b0, passiveItemBuffer },
    items,
  };
}
