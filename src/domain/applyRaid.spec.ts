import { describe, expect, it } from 'vitest';

import {
  CENTER_HEX_ID,
  DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
  HOME_HEX_ID,
} from './constants.ts';
import {
  applyRaidMarch,
  buildHexRaidPath,
  resolveRaidMarchTargetHex,
} from './raidMarch.ts';
import { createNewBusiness } from './factories/createBusiness.ts';
import type { HexMap, PlaceSlot } from './types/map.ts';

function emptyHex(id: string, q: number, r: number) {
  return {
    id,
    coordinates: { q, r },
    isUnlocked: true,
    danger: 0,
    integrity: 80,
    placeSlots: [] as PlaceSlot[],
  };
}

function hexMapHomeToCenterWithBusiness(params: {
  bizHexId: string;
  bizQ: number;
  bizR: number;
  /** Implicit full HP via migration semantics */
}): HexMap {
  const biz = createNewBusiness({
    id: 'biz_1',
    name: 'Test Shop',
    type: 'loja',
    nowMs: 0,
    productionRate: 1,
  });
  const businessSlot = {
    id: 'slot_biz',
    hexId: params.bizHexId,
    ownedBy: 'char_1',
    type: 'business' as const,
    priceToBuy: 0,
    business: biz,
    structureHp: {
      current: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
      max: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
    },
  };

  return {
    size: 5,
    hexes: {
      [CENTER_HEX_ID]: {
        ...emptyHex(CENTER_HEX_ID, 0, 0),
        placeSlots: [],
      },
      [params.bizHexId]: {
        ...emptyHex(params.bizHexId, params.bizQ, params.bizR),
        placeSlots: [businessSlot],
      },
    },
  };
}

describe('raid march helpers', () => {
  it('resolveRaidMarchTargetHex falls back when id missing', () => {
    const hm = hexMapHomeToCenterWithBusiness({
      bizHexId: HOME_HEX_ID,
      bizQ: 1,
      bizR: 0,
    });
    expect(resolveRaidMarchTargetHex(undefined, hm)).toBe(HOME_HEX_ID);
    expect(resolveRaidMarchTargetHex('99,99', hm)).toBe(HOME_HEX_ID);
  });

  it('buildHexRaidPath walks toward Centro on ring-1', () => {
    const hm = hexMapHomeToCenterWithBusiness({
      bizHexId: HOME_HEX_ID,
      bizQ: 1,
      bizR: 0,
    });
    const path = buildHexRaidPath(HOME_HEX_ID, CENTER_HEX_ID, hm);
    expect(path[0]).toBe(HOME_HEX_ID);
    expect(path[path.length - 1]).toBe(CENTER_HEX_ID);
  });
});

describe('applyRaidMarch', () => {
  it('does not reduce civilian population', () => {
    const hm = hexMapHomeToCenterWithBusiness({
      bizHexId: HOME_HEX_ID,
      bizQ: 1,
      bizR: 0,
    });
    const r = applyRaidMarch({
      threatCount: 50,
      civilianPopulation: 8000,
      hexMap: hm,
      targetHexId: HOME_HEX_ID,
      rng: () => 0,
    });
    expect(r.civilianPopulation).toBe(8000);
  });

  it('applies structural damage from threat count without consuming threat state', () => {
    const hm = hexMapHomeToCenterWithBusiness({
      bizHexId: HOME_HEX_ID,
      bizQ: 1,
      bizR: 0,
    });
    const r = applyRaidMarch({
      threatCount: 10,
      civilianPopulation: 5000,
      hexMap: hm,
      targetHexId: HOME_HEX_ID,
      rng: () => 0,
    });
    const slot = r.hexMap.hexes[HOME_HEX_ID]!.placeSlots[0]!;
    expect(slot.type).toBe('business');
    if (slot.type === 'business' && slot.structureHp) {
      expect(slot.structureHp.current).toBe(60);
      expect(slot.structureHp.max).toBe(100);
    }
    expect(r.prefeituraDestroyed).toBe(false);
  });

  it('collapses business to ruin when structural HP reaches zero', () => {
    const hm = hexMapHomeToCenterWithBusiness({
      bizHexId: HOME_HEX_ID,
      bizQ: 1,
      bizR: 0,
    });
    const r = applyRaidMarch({
      threatCount: 25,
      civilianPopulation: 5000,
      hexMap: hm,
      targetHexId: HOME_HEX_ID,
      rng: () => 0,
    });
    const slot = r.hexMap.hexes[HOME_HEX_ID]!.placeSlots[0]!;
    expect(slot.type).toBe('ruin');
    expect(r.logLines.some((l) => l.includes('structural HP'))).toBe(true);
  });

  it('skips Centro — does not damage slots downtown during P2 march', () => {
    const biz = createNewBusiness({
      id: 'biz_c',
      name: 'Downtown',
      type: 'loja',
      nowMs: 0,
      productionRate: 1,
    });
    const hm: HexMap = {
      size: 5,
      hexes: {
        [CENTER_HEX_ID]: {
          ...emptyHex(CENTER_HEX_ID, 0, 0),
          placeSlots: [
            {
              id: 'slot_c',
              hexId: CENTER_HEX_ID,
              ownedBy: 'char_1',
              type: 'business',
              priceToBuy: 0,
              business: biz,
              structureHp: {
                current: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
                max: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
              },
            },
          ],
        },
        [HOME_HEX_ID]: {
          ...emptyHex(HOME_HEX_ID, 1, 0),
          placeSlots: [],
        },
      },
    };
    const r = applyRaidMarch({
      threatCount: 100,
      civilianPopulation: 1000,
      hexMap: hm,
      targetHexId: HOME_HEX_ID,
      rng: () => 0,
    });
    const centerSlot = r.hexMap.hexes[CENTER_HEX_ID]!.placeSlots[0]!;
    expect(centerSlot.type).toBe('business');
    expect(r.prefeituraDestroyed).toBe(false);
  });
});
