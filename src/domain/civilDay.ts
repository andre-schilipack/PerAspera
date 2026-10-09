import {
  CIVIL_FOOD_PER_PERSON_PER_DAY,
  CIVIL_GOODS_PER_PERSON_PER_DAY,
  CIVIL_POPULATION_GROWTH,
  CIVIL_POWER_PER_PERSON_PER_DAY,
} from './constants.ts';
import type { PassiveItemBuffer } from './types/economy.ts';

export interface CivilDayInput {
  population: number;
  power: number;
  pantry: PassiveItemBuffer;
  housingSlots: number;
  brownedOut: boolean;
}

export interface CivilDayResult {
  population: number;
  power: number;
  pantry: PassiveItemBuffer;
  fed: boolean;
  happy: boolean;
  housed: boolean;
  grew: boolean;
  /** Unmet item demand the Prefeitura may bid for. */
  shortfall: PassiveItemBuffer;
}

function take(pantry: PassiveItemBuffer, templateId: string, need: number): {
  pantry: PassiveItemBuffer;
  got: number;
} {
  const have = pantry[templateId] ?? 0;
  const got = Math.min(have, need);
  const next = { ...pantry };
  const left = have - got;
  if (left <= 0.000_001) delete next[templateId];
  else next[templateId] = left;
  return { pantry: next, got };
}

/**
 * One wage day of civil consumption.
 * Food and consumer goods come from the pantry. Power comes from the pool.
 * Population grows only when fed, happy, and a free housing slot exists.
 */
export function applyCivilDay(input: CivilDayInput): CivilDayResult {
  const pop = Math.max(0, input.population);
  const foodNeed = pop * CIVIL_FOOD_PER_PERSON_PER_DAY;
  const goodsNeed = pop * CIVIL_GOODS_PER_PERSON_PER_DAY;
  const powerNeed = pop * CIVIL_POWER_PER_PERSON_PER_DAY;

  const food = take(input.pantry, 'food_ration', foodNeed);
  const goods = take(food.pantry, 'consumer_goods', goodsNeed);
  const power = Math.max(0, input.power - powerNeed);
  const fed = food.got + 0.000_001 >= foodNeed;
  const goodsMet = goods.got + 0.000_001 >= goodsNeed;
  const powerMet = input.power + 0.000_001 >= powerNeed;
  const happy = goodsMet && powerMet && !input.brownedOut;
  const housed = input.housingSlots > 0;
  const grew = fed && happy && housed;
  const shortfall: PassiveItemBuffer = {};
  if (foodNeed - food.got > 0.000_001) shortfall.food_ration = foodNeed - food.got;
  if (goodsNeed - goods.got > 0.000_001) {
    shortfall.consumer_goods = goodsNeed - goods.got;
  }

  return {
    population: grew ? pop + CIVIL_POPULATION_GROWTH : pop,
    power,
    pantry: goods.pantry,
    fed,
    happy,
    housed,
    grew,
    shortfall,
  };
}
