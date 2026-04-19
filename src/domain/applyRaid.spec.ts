import { describe, expect, it } from 'vitest';

import { CENTER_HEX_ID, NPC_OWNER_PREFEITURA } from './constants.ts';
import { createNewBusiness } from './factories/createBusiness.ts';
import { applyRaidFromRemainingThreat } from './applyRaid.ts';
import type { HexMap } from './types/map.ts';

function minimalHexMapWithBusiness(): HexMap {
  const biz = createNewBusiness({
    id: 'biz_1',
    name: 'Test',
    type: 'loja',
    nowMs: 0,
    productionRate: 1,
  });
  return {
    size: 5,
    hexes: {
      [CENTER_HEX_ID]: {
        id: CENTER_HEX_ID,
        coordinates: { q: 0, r: 0 },
        isUnlocked: true,
        danger: 0,
        integrity: 80,
        placeSlots: [
          {
            id: 'slot_test_biz',
            hexId: CENTER_HEX_ID,
            ownedBy: 'char_1',
            type: 'business',
            priceToBuy: 0,
            business: biz,
          },
        ],
      },
    },
  };
}

describe('applyRaidFromRemainingThreat', () => {
  it('reduces population by threat', () => {
    const r = applyRaidFromRemainingThreat({
      remainingThreatPoints: 2,
      civilianPopulation: 1000,
      hexMap: { size: 5, hexes: {} },
      rng: () => 0,
    });
    expect(r.civilianPopulation).toBeLessThan(1000);
    expect(r.logLines.length).toBeGreaterThan(0);
    expect(r.prefeituraDestroyed).toBe(false);
  });

  it('destroys a business when threat budget allows', () => {
    const hm = minimalHexMapWithBusiness();
    const r = applyRaidFromRemainingThreat({
      remainingThreatPoints: 5,
      civilianPopulation: 5000,
      hexMap: hm,
      rng: () => 0,
    });
    const slot = r.hexMap.hexes[CENTER_HEX_ID]!.placeSlots[0]!;
    expect(slot.type).toBe('empty');
    expect(r.prefeituraDestroyed).toBe(false);
  });

  it('destroys Prefeitura on Centro when threat remains after businesses', () => {
    const hm: HexMap = {
      size: 5,
      hexes: {
        [CENTER_HEX_ID]: {
          id: CENTER_HEX_ID,
          coordinates: { q: 0, r: 0 },
          isUnlocked: true,
          danger: 0,
          integrity: 80,
          placeSlots: [
            {
              id: 'slot_pref',
              hexId: CENTER_HEX_ID,
              ownedBy: NPC_OWNER_PREFEITURA,
              type: 'prefeitura',
              priceToBuy: 0,
            },
          ],
        },
      },
    };
    const r = applyRaidFromRemainingThreat({
      remainingThreatPoints: 6,
      civilianPopulation: 50_000,
      hexMap: hm,
      rng: () => 0,
    });
    expect(r.prefeituraDestroyed).toBe(true);
    const prefSlot = r.hexMap.hexes[CENTER_HEX_ID]!.placeSlots[0]!;
    expect(prefSlot.type).toBe('empty');
  });
});
