import { CENTER_HEX_ID } from '../domain/constants.ts';

import {
  GAME_FAB_ACTION_ITEMS,
  type GameFabActionItem,
  type GameScreen,
} from './gameNavigation.ts';

/**
 * NPC-tied FAB actions only appear when the player stands on the correct hex.
 * - Market & Defense: Centro (Mercado + Quartel).
 * - Leaderboard: home hex (Velho Rabiscão).
 */
export function isScreenAvailableAtHex(
  screen: GameScreen,
  currentHexId: string,
  homeHexId: string,
): boolean {
  switch (screen) {
    case 'market':
    case 'defense':
      return currentHexId === CENTER_HEX_ID;
    case 'leaderboard':
      return currentHexId === homeHexId;
    default:
      return true;
  }
}

export function fabActionItemsForHex(
  currentHexId: string,
  homeHexId: string,
): GameFabActionItem[] {
  return GAME_FAB_ACTION_ITEMS.filter((item) =>
    isScreenAvailableAtHex(item.id, currentHexId, homeHexId),
  );
}
