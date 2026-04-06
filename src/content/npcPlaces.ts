import { NPC_OWNER_CITY } from '../domain/constants.ts';
import type { PlaceSlot } from '../domain/types/map.ts';

/** Screens tied to fixed NPC tiles (FAB / nav targets). */
export type NpcLinkedScreen = 'defense' | 'leaderboard' | 'market';

export function placeSlotDisplayTitle(slot: PlaceSlot): string {
  switch (slot.type) {
    case 'market':
      return 'Mercado Municipal';
    case 'prefeitura':
      return 'Prefeitura';
    case 'quartel':
      return 'Quartel General';
    case 'historian':
      return 'Velho Rabiscão';
    case 'home':
      return "Home (parents' place)";
    case 'empty':
      return slot.ownedBy === NPC_OWNER_CITY
        ? 'Empty city lot'
        : 'Owned empty lot';
    case 'business':
      return slot.business?.name ?? 'Business';
    case 'other':
      return 'Plot';
    default:
      return slot.type;
  }
}

export function placeSlotNpcBlurb(slot: PlaceSlot): string | null {
  switch (slot.type) {
    case 'quartel':
      return 'Enlist for nightly defense — use the Defense screen.';
    case 'historian':
      return 'Reads the Score List — use the Scores screen.';
    case 'market':
      return 'City-fixed buy/sell — use the Market screen.';
    case 'prefeitura':
      return 'Repairs & bureaucracy (more later).';
    default:
      return null;
  }
}

/**
 * Quick jump from Lots when you are standing on the correct hex.
 */
export function placeSlotLinkedScreen(
  slot: PlaceSlot,
): NpcLinkedScreen | null {
  switch (slot.type) {
    case 'quartel':
      return 'defense';
    case 'historian':
      return 'leaderboard';
    case 'market':
      return 'market';
    default:
      return null;
  }
}

export function linkedScreenButtonLabel(screen: NpcLinkedScreen): string {
  switch (screen) {
    case 'defense':
      return 'Open Defense';
    case 'leaderboard':
      return 'Open Scores';
    case 'market':
      return 'Open Market';
  }
}

/** Lore / tutorial one-liner for glossary or tips. */
export const loreNpcNavigationTip: string =
  'Centro hosts Mercado Municipal, Prefeitura, and Quartel General — use Market / Defense screens there. Your home hex has Velho Rabiscão — open Scores when you are home.';
