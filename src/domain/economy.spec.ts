import { describe, expect, it } from 'vitest';

import { applyBuildingProductionTick } from './buildingProduction.ts';
import { depositIntoBusinessSlots } from './businessInventorySlots.ts';
import {
  applyMapProductionTick,
  applyPayrollForWageDay,
} from './businessEconomyTick.ts';
import { resolveManualWork } from './businessPayout.ts';
import { BUILDING_CATALOG } from './catalog/buildings.ts';
import { applyCivilDay } from './civilDay.ts';
import { createInitialCityCore } from './cityEconomy.ts';
import {
  CITY_POWER_START,
  CIVIL_POPULATION_GROWTH,
  DEFAULT_WAGE_PER_DAY,
  FOUNDERS_COAL_STOCK,
  HOSPITAL_CURE_HP,
  HOSPITAL_CURE_POWER,
  NPC_OWNER_PREFEITURA,
  STARTING_CREDS,
} from './constants.ts';
import { createNewBusiness } from './factories/createBusiness.ts';
import { createCharacter } from './factories/createCharacter.ts';
import { createInitialWorld } from './factories/createInitialWorld.ts';
import { applyHospitalCure } from './hospitalCure.ts';
import { migrateLegacyBusinessSlots } from './migrateBusinesses.ts';
import { cancelOrder, placeOrder, type MarketOrder } from './orderBook.ts';
import type { Business } from './types/economy.ts';
import type { HexMap, HexTile, PlaceSlot } from './types/map.ts';

function tile(id: string, slots: PlaceSlot[]): HexTile {
  const [q, r] = id.split(',').map(Number);
  return {
    id,
    coordinates: { q, r },
    danger: 0,
    integrity: 80,
    placeSlots: slots,
    isUnlocked: true,
  };
}

function slot(business: Business, ownedBy: string): PlaceSlot {
  return {
    id: `slot_${business.id}`,
    hexId: '0,1',
    ownedBy,
    type: 'business',
    priceToBuy: 0,
    business,
  };
}

function mapWith(business: Business, ownedBy: string): HexMap {
  return { size: 1, hexes: { '0,1': tile('0,1', [slot(business, ownedBy)]) } };
}

function qty(business: Business, templateId: string): number {
  return business.inventorySlots.reduce(
    (n, cell) => n + (cell?.templateId === templateId ? cell.quantity : 0),
    0,
  );
}

describe('building catalog and recipe ticks', () => {
  it('lists the sixteen Act 1 buildings, with the workshop as the only multi-recipe site', () => {
    expect(BUILDING_CATALOG).toHaveLength(16);
    const multi = BUILDING_CATALOG.filter((b) => b.recipes.length > 1);
    expect(multi.map((b) => b.id)).toEqual(['oficina']);
    expect(BUILDING_CATALOG.some((b) => b.id === 'eolico')).toBe(true);
  });

  it('turns scrap into metal when the furnace is staffed and powered', () => {
    let furnace = createNewBusiness({
      id: 'furnace',
      buildingId: 'fundicao',
      nowMs: 0,
      workersAssigned: 1,
    });
    furnace = {
      ...furnace,
      inventorySlots: depositIntoBusinessSlots(furnace.inventorySlots, 'scrap_metal', 4).slots,
    };
    const tick = applyBuildingProductionTick(furnace, 100);
    expect(tick.brownedOut).toBe(false);
    expect(tick.storedOutput.metal).toBe(1);
    expect(qty(tick.business, 'scrap_metal')).toBe(3);
    expect(qty(tick.business, 'metal')).toBe(1);
  });

  it('produces nothing without a worker', () => {
    const farm = createNewBusiness({ id: 'farm', buildingId: 'fazenda', nowMs: 0 });
    const tick = applyBuildingProductionTick(farm, 100);
    expect(tick.storedOutput).toEqual({});
    expect(tick.powerDelta).toBe(0);
  });

  it('drops the tick output when storage is already full', () => {
    const farm = createNewBusiness({
      id: 'farm',
      buildingId: 'fazenda',
      nowMs: 0,
      workersAssigned: 1,
    });
    const full = {
      ...farm,
      inventorySlots: farm.inventorySlots.map(() => ({
        templateId: 'food_ration',
        quantity: 999,
      })),
    };
    const tick = applyBuildingProductionTick(full, 100);
    expect(tick.lostOutput.food_ration).toBe(1);
    expect(tick.storedOutput.food_ration).toBeUndefined();
  });

  it('refuses a powered recipe when the pool cannot cover the draw', () => {
    let furnace = createNewBusiness({
      id: 'furnace',
      buildingId: 'fundicao',
      nowMs: 0,
      workersAssigned: 1,
    });
    furnace = {
      ...furnace,
      inventorySlots: depositIntoBusinessSlots(furnace.inventorySlots, 'scrap_metal', 2).slots,
    };
    const tick = applyBuildingProductionTick(furnace, 0);
    expect(tick.brownedOut).toBe(true);
    expect(tick.storedOutput).toEqual({});
    expect(qty(tick.business, 'scrap_metal')).toBe(2);
  });
});

describe('seed, power pool, public work, and payroll', () => {
  it('seeds a public farm and a coal-stocked plant, and keeps wind out of the seed', () => {
    const world = createInitialWorld({ slotIdCounter: 1 });
    const slots = world.hexMap.hexes['0,1']?.placeSlots ?? [];
    const farm = slots.find((s) => s.business?.id === 'biz_founders_farm')?.business;
    const plant = slots.find((s) => s.business?.id === 'biz_founders_plant')?.business;
    expect(farm?.buildingId).toBe('fazenda');
    expect(farm?.public).toBe(true);
    expect(farm?.workersAssigned).toBe(2);
    expect(plant?.buildingId).toBe('termoeletrica');
    expect(plant?.public).toBe(false);
    expect(plant ? qty(plant, 'coal') : 0).toBe(FOUNDERS_COAL_STOCK);
    const ids = Object.values(world.hexMap.hexes).flatMap((hex) =>
      hex.placeSlots.map((s) => s.business?.buildingId),
    );
    expect(ids).not.toContain('eolico');

    const city = createInitialCityCore();
    expect(city.energyCurrent).toBe(CITY_POWER_START);
    expect(city.energyGenerationPerTick).toBe(0);
    expect(city.energyConsumptionPerTick).toBe(0);
  });

  it('adds plant power and lifts city-farm food into the pantry', () => {
    const world = createInitialWorld({ slotIdCounter: 1 });
    const tick = applyMapProductionTick(world.hexMap, CITY_POWER_START);
    expect(tick.brownedOut).toBe(false);
    expect(tick.power).toBeGreaterThan(CITY_POWER_START);
    expect(tick.pantryAdd.food_ration).toBe(2);
  });

  it('keeps 80% of a public harvest and the owner share for the site owner', () => {
    const farm = createNewBusiness({
      id: 'farm',
      buildingId: 'fazenda',
      nowMs: 0,
      isPublic: true,
      publicWorkTax: 0.2,
    });
    const hired = resolveManualWork(farm, 'char_2', NPC_OWNER_PREFEITURA);
    expect(hired.grants[0]?.quantity).toBe(4);
    expect(hired.ownerShare).toEqual([{ templateId: 'food_ration', quantity: 1 }]);

    const owner = resolveManualWork(farm, 'char_1', 'char_1');
    expect(owner.grants[0]?.quantity).toBe(5);
    expect(owner.ownerShare).toEqual([]);
  });

  it('pays city-farm wages from the treasury and fires the crew when it cannot', () => {
    const farm = createNewBusiness({
      id: 'farm',
      buildingId: 'fazenda',
      nowMs: 0,
      workersAssigned: 2,
    });
    const broke = applyPayrollForWageDay(mapWith(farm, NPC_OWNER_PREFEITURA), {}, 10);
    expect(broke.treasury).toBe(10);
    expect(broke.hexMap.hexes['0,1']?.placeSlots[0]?.business?.workersAssigned).toBe(0);

    const paid = applyPayrollForWageDay(mapWith(farm, NPC_OWNER_PREFEITURA), {}, 20);
    expect(paid.treasury).toBe(20 - 2 * DEFAULT_WAGE_PER_DAY);
    expect(paid.hexMap.hexes['0,1']?.placeSlots[0]?.business?.workersAssigned).toBe(2);
  });
});

describe('civil day', () => {
  const ready = {
    population: 1000,
    power: 100,
    pantry: { food_ration: 4, consumer_goods: 1 },
    housingSlots: 4,
    brownedOut: false,
  };

  it('grows only when food, consumer goods, power, and a housing slot are all covered', () => {
    const grew = applyCivilDay(ready);
    expect(grew.grew).toBe(true);
    expect(grew.population).toBe(1000 + CIVIL_POPULATION_GROWTH);

    expect(applyCivilDay({ ...ready, pantry: {} }).fed).toBe(false);
    expect(applyCivilDay({ ...ready, pantry: { food_ration: 4 } }).happy).toBe(false);
    expect(applyCivilDay({ ...ready, brownedOut: true }).grew).toBe(false);
    expect(applyCivilDay({ ...ready, housingSlots: 0 }).grew).toBe(false);
    expect(applyCivilDay({ ...ready, power: 0 }).grew).toBe(false);
  });
});

describe('order book', () => {
  it('fills the earlier order at the same price, and the better price first', () => {
    const early: MarketOrder = {
      id: 'early',
      side: 'sell',
      templateId: 'food_ration',
      unitPrice: 6,
      quantity: 2,
      ownerId: 'seller_a',
      createdAt: 1,
    };
    const late: MarketOrder = { ...early, id: 'late', ownerId: 'seller_b', createdAt: 5 };
    const samePrice = placeOrder([late, early], {
      id: 'buy',
      side: 'buy',
      templateId: 'food_ration',
      unitPrice: 6,
      quantity: 2,
      ownerId: 'buyer',
      createdAt: 9,
    });
    expect(samePrice.fills[0]?.sellerId).toBe('seller_a');
    expect(samePrice.orders.find((o) => o.id === 'late')?.quantity).toBe(2);

    const highBid: MarketOrder = {
      id: 'high',
      side: 'buy',
      templateId: 'food_ration',
      unitPrice: 8,
      quantity: 1,
      ownerId: 'bidder',
      createdAt: 2,
    };
    const lowBid: MarketOrder = { ...highBid, id: 'low', unitPrice: 6, ownerId: 'other', createdAt: 1 };
    const betterPrice = placeOrder([lowBid, highBid], {
      id: 'sell',
      side: 'sell',
      templateId: 'food_ration',
      unitPrice: 6,
      quantity: 1,
      ownerId: 'seller',
      createdAt: 3,
    });
    expect(betterPrice.fills[0]?.unitPrice).toBe(8);
    expect(betterPrice.credsToSeller.seller).toBe(8);
  });

  it('refunds a buyer only the price improvement and returns a cancelled reservation', () => {
    const ask: MarketOrder = {
      id: 'ask',
      side: 'sell',
      templateId: 'coal',
      unitPrice: 4,
      quantity: 3,
      ownerId: 'seller',
      createdAt: 1,
    };
    const bought = placeOrder([ask], {
      id: 'bid',
      side: 'buy',
      templateId: 'coal',
      unitPrice: 10,
      quantity: 3,
      ownerId: 'buyer',
      createdAt: 2,
    });
    expect(bought.credsToSeller.seller).toBe(12);
    expect(bought.credsRefund).toBe(18);
    expect(bought.orders).toEqual([]);

    const resting: MarketOrder = {
      id: 'rest',
      side: 'buy',
      templateId: 'coal',
      unitPrice: 5,
      quantity: 2,
      ownerId: 'buyer',
      createdAt: 1,
    };
    const cancelled = cancelOrder([resting], 'rest', 'buyer');
    expect(cancelled.released?.quantity).toBe(2);
    expect(cancelled.orders).toEqual([]);
  });
});

describe('hospital and legacy shop migration', () => {
  it('restores 30 HP outside combat and refuses when creds or power are short', () => {
    const cured = applyHospitalCure({
      hp: 40,
      maxHp: 100,
      creds: 20,
      credsCost: 20,
      power: 10,
    });
    expect(cured.ok).toBe(true);
    expect(cured.hp).toBe(40 + HOSPITAL_CURE_HP);
    expect(cured.power).toBe(10 - HOSPITAL_CURE_POWER);

    expect(
      applyHospitalCure({ hp: 40, maxHp: 100, creds: 0, credsCost: 20, power: 10 }).reason,
    ).toBe('no_creds');
    expect(
      applyHospitalCure({ hp: 40, maxHp: 100, creds: 20, credsCost: 20, power: 1 }).reason,
    ).toBe('no_power');
  });

  it('pays a legacy shop once and turns the lot into an empty owned lot', () => {
    const owner = createCharacter({
      id: 'char_1',
      name: 'Ada',
      homeHexId: '1,0',
      nowMs: 0,
    });
    const hexMap: HexMap = {
      size: 1,
      hexes: {
        '1,0': tile('1,0', [
          {
            id: 'slot_shop',
            hexId: '1,0',
            ownedBy: owner.id,
            type: 'business',
            priceToBuy: 0,
            business: {
              id: 'shop',
              name: 'Loja',
              type: 'loja',
              credsPending: 12.9,
            } as unknown as Business,
          },
        ]),
      },
    };
    const migrated = migrateLegacyBusinessSlots(hexMap, { [owner.id]: owner });
    expect(migrated.characters[owner.id]?.creds).toBe(STARTING_CREDS + 12);
    const next = migrated.hexMap.hexes['1,0']?.placeSlots[0];
    expect(next?.type).toBe('empty');
    expect(next?.business).toBeUndefined();
    expect(next?.ownedBy).toBe(owner.id);
  });
});
