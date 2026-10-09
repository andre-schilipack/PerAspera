import { HOSPITAL_CURE_HP, HOSPITAL_CURE_POWER } from './constants.ts';

export interface CureResult {
  ok: boolean;
  reason?: 'no_power' | 'no_creds';
  power: number;
  hp: number;
}

/** One hospital use. Restores HP outside combat and draws city power. */
export function applyHospitalCure(params: {
  hp: number;
  maxHp: number;
  creds: number;
  credsCost: number;
  power: number;
}): CureResult {
  if (params.creds < params.credsCost) {
    return { ok: false, reason: 'no_creds', power: params.power, hp: params.hp };
  }
  if (params.power + 0.000_001 < HOSPITAL_CURE_POWER) {
    return { ok: false, reason: 'no_power', power: params.power, hp: params.hp };
  }
  return {
    ok: true,
    power: params.power - HOSPITAL_CURE_POWER,
    hp: Math.min(params.maxHp, params.hp + HOSPITAL_CURE_HP),
  };
}
