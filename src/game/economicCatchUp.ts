import {
  applyMapProductionTick,
  applyPayrollForWageDay,
  housingSlotsOnMap,
} from '../domain/businessEconomyTick.ts';
import { applyCivilDay } from '../domain/civilDay.ts';
import { mergePantry, placeOrder, pullOwnerOrders, type MarketOrder } from '../domain/orderBook.ts';
import {
  ECONOMIC_TICK_INTERVAL_MS,
  ECONOMIC_TICKS_PER_WAGE_DAY,
  INITIAL_CIVILIAN_POPULATION,
  MAX_ECONOMIC_CATCH_UP_TICKS,
  NPC_OWNER_PREFEITURA,
  PREFEITURA_TREASURY_INITIAL,
} from '../domain/constants.ts';
import { getMarketCatalogEntry } from '../domain/marketCatalog.ts';
import type { Character } from '../domain/types/index.ts';
import type { HexMap } from '../domain/types/index.ts';
import type { PassiveItemBuffer } from '../domain/types/economy.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useMarketStore } from '../stores/useMarketStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

export interface EconomicTickSummary {
  ticksApplied: number;
  energyDeltaTotal: number;
  brownoutTicks: number;
  stabilityLostTotal: number;
}

function postPrefeituraBids(params: {
  orders: MarketOrder[];
  treasury: number;
  pantry: PassiveItemBuffer;
  shortfall: PassiveItemBuffer;
  nowMs: number;
  characters: Record<string, Character>;
}): {
  orders: MarketOrder[];
  treasury: number;
  pantry: PassiveItemBuffer;
  characters: Record<string, Character>;
} {
  let orders = params.orders;
  let treasury = params.treasury;
  let pantry = params.pantry;
  let characters = params.characters;
  let seq = 0;
  for (const [templateId, rawQty] of Object.entries(params.shortfall)) {
    const entry = getMarketCatalogEntry(templateId);
    if (!entry) continue;
    const pulled = pullOwnerOrders(orders, NPC_OWNER_PREFEITURA, templateId);
    orders = pulled.orders;
    for (const released of pulled.released) {
      treasury += released.quantity * released.unitPrice;
    }
    const qty = Math.floor(rawQty);
    if (qty <= 0 || entry.value <= 0) continue;
    const affordable = Math.min(qty, Math.floor(treasury / entry.value));
    if (affordable <= 0) continue;
    const order: MarketOrder = {
      id: `pref_bid_${params.nowMs}_${seq++}`,
      side: 'buy',
      templateId,
      unitPrice: entry.value,
      quantity: affordable,
      ownerId: NPC_OWNER_PREFEITURA,
      createdAt: params.nowMs,
    };
    const placed = placeOrder(orders, order);
    orders = placed.orders;
    treasury -= affordable * entry.value;
    treasury += placed.credsRefund;
    for (const [sellerId, creds] of Object.entries(placed.credsToSeller)) {
      if (sellerId === NPC_OWNER_PREFEITURA) {
        treasury += creds;
        continue;
      }
      const ch = characters[sellerId];
      if (!ch) continue;
      characters = {
        ...characters,
        [sellerId]: { ...ch, creds: ch.creds + creds },
      };
    }
    for (const item of placed.itemsToBuyer) {
      if (item.ownerId === NPC_OWNER_PREFEITURA) {
        pantry = mergePantry(pantry, { [item.templateId]: item.quantity });
      }
    }
  }
  return { orders, treasury, pantry, characters };
}

/**
 * Applies queued economic ticks since `lastEconomicTickAt`.
 * Buildings feed and draw the power pool. Every wage day settles payroll,
 * civil consumption, and Prefeitura bids for the pantry shortfall.
 */
export function runEconomicCatchUp(nowMs: number): EconomicTickSummary {
  const city = useCityStore.getState();
  let cityCore = city.cityCore;
  const lastAt = city.lastEconomicTickAt;
  let economicTickCounter = city.economicTickCounter ?? 0;
  let civilianPopulation = city.civilianPopulation ?? INITIAL_CIVILIAN_POPULATION;
  let treasury = city.treasury ?? PREFEITURA_TREASURY_INITIAL;
  let pantry: PassiveItemBuffer = { ...(city.pantry ?? {}) };
  let brownoutThisWageDay = city.brownoutThisWageDay ?? false;

  const elapsed = Math.max(0, nowMs - lastAt);
  const rawTicks = Math.floor(elapsed / ECONOMIC_TICK_INTERVAL_MS);
  const ticksToApply = Math.min(rawTicks, MAX_ECONOMIC_CATCH_UP_TICKS);

  if (ticksToApply <= 0) {
    return {
      ticksApplied: 0,
      energyDeltaTotal: 0,
      brownoutTicks: 0,
      stabilityLostTotal: 0,
    };
  }

  const startEnergy = cityCore.energyCurrent;
  let brownoutTicks = 0;
  let hexMap: HexMap | null = useWorldStore.getState().hexMap;
  const startCharactersSnapshot: Record<string, Character> = {
    ...useCharactersStore.getState().characters,
  };
  let characters: Record<string, Character> = { ...startCharactersSnapshot };
  let orders = [...(useMarketStore.getState().orders ?? [])];

  for (let i = 0; i < ticksToApply; i++) {
    economicTickCounter += 1;
    if (hexMap) {
      const produced = applyMapProductionTick(hexMap, cityCore.energyCurrent);
      hexMap = produced.hexMap;
      cityCore = {
        ...cityCore,
        energyCurrent: Math.min(cityCore.energyMax, produced.power),
      };
      pantry = mergePantry(pantry, produced.pantryAdd);
      if (produced.brownedOut) {
        brownoutThisWageDay = true;
        brownoutTicks += 1;
      }
      if (economicTickCounter % ECONOMIC_TICKS_PER_WAGE_DAY === 0) {
        const paid = applyPayrollForWageDay(hexMap, characters, treasury);
        hexMap = paid.hexMap;
        characters = paid.characters;
        treasury = paid.treasury;
        const civil = applyCivilDay({
          population: civilianPopulation,
          power: cityCore.energyCurrent,
          pantry,
          housingSlots: housingSlotsOnMap(hexMap),
          brownedOut: brownoutThisWageDay,
        });
        civilianPopulation = civil.population;
        pantry = civil.pantry;
        cityCore = {
          ...cityCore,
          energyCurrent: Math.min(cityCore.energyMax, civil.power),
        };
        const bids = postPrefeituraBids({
          orders,
          treasury,
          pantry,
          shortfall: civil.shortfall,
          nowMs: lastAt + (i + 1) * ECONOMIC_TICK_INTERVAL_MS,
          characters,
        });
        orders = bids.orders;
        treasury = bids.treasury;
        pantry = bids.pantry;
        characters = bids.characters;
        brownoutThisWageDay = false;
      }
    }
  }

  useCityStore.setState({
    cityCore,
    lastEconomicTickAt: lastAt + ticksToApply * ECONOMIC_TICK_INTERVAL_MS,
    economicTickCounter,
    civilianPopulation,
    treasury,
    pantry,
    brownoutThisWageDay,
  });

  if (hexMap) useWorldStore.setState({ hexMap });
  useMarketStore.setState({ orders });

  const updateCharacter = useCharactersStore.getState().updateCharacter;
  for (const id of Object.keys(characters)) {
    const ch = characters[id];
    const was = startCharactersSnapshot[id];
    if (!ch) continue;
    if (!was || was.creds !== ch.creds) updateCharacter(id, { creds: ch.creds });
  }

  return {
    ticksApplied: ticksToApply,
    energyDeltaTotal: cityCore.energyCurrent - startEnergy,
    brownoutTicks,
    stabilityLostTotal: 0,
  };
}
