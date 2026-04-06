import { CENTER_HEX_ID } from '../domain/constants.ts';

import { GAME_NAV_ITEMS, type GameNavItem, type GameScreen } from './gameNavigation.ts';

/**
 * NPC-tied screens only appear in nav when the player stands on the correct hex.
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

export function navItemsForHex(
  currentHexId: string,
  homeHexId: string,
): GameNavItem[] {
  return GAME_NAV_ITEMS.filter((item) =>
    isScreenAvailableAtHex(item.id, currentHexId, homeHexId),
  );
}
