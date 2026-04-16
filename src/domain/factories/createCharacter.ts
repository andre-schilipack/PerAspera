import {
  PLAYER_BASE_MAX_HP,
  STAMINA_INITIAL,
  STAMINA_MAX_BASE,
  STARTING_CREDS,
} from '../constants.ts';
import type { Character } from '../types/index.ts';

export interface CreateCharacterParams {
  id: string;
  name: string;
  homeHexId: string;
  nowMs: number;
  /** Defaults to {@link homeHexId}. */
  currentHexId?: string;
  /** Override starter creds (defaults to {@link STARTING_CREDS}). */
  startingCreds?: number;
}

/**
 * New playable character: age 16, level 1, baseline stamina (200/240) and one move.
 */
export function createCharacter(params: CreateCharacterParams): Character {
  const {
    id,
    name,
    homeHexId,
    currentHexId,
    nowMs,
    startingCreds = STARTING_CREDS,
  } = params;

  return {
    id,
    name,
    age: 16,
    level: 1,
    exp: 0,
    creds: startingCreds,
    stamina: {
      current: STAMINA_INITIAL,
      max: STAMINA_MAX_BASE,
      lastUpdated: nowMs,
    },
    health: {
      current: PLAYER_BASE_MAX_HP,
      max: PLAYER_BASE_MAX_HP,
      lastUpdated: nowMs,
    },
    score: 0,
    reputation: 0,
    homeHexId,
    currentHexId: currentHexId ?? homeHexId,
    availableMoves: ['basic_attack'],
    currentDefenseContribution: 0,
    autoEnlistNightlyDefense: true,
    inventory: [],
    createdAt: nowMs,
  };
}
