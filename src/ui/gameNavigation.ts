import {
  BookOpen,
  LayoutGrid,
  Map,
  Package,
  Shield,
  ShoppingCart,
  Trophy,
  User,
} from 'lucide-react';

/**
 * Permanent top navigation — same on all viewports.
 */
export const GAME_TOP_NAV_ITEMS = [
  { id: 'map' as const, label: 'Map', Icon: Map },
  { id: 'profile' as const, label: 'Profile', Icon: User },
  { id: 'inventory' as const, label: 'Inventory', Icon: Package },
  { id: 'lore' as const, label: 'Lore', Icon: BookOpen },
] as const;

/**
 * Bottom FAB: world / NPC actions (hex-gated where applicable).
 */
export const GAME_FAB_ACTION_ITEMS = [
  {
    id: 'market' as const,
    label: 'Market',
    Icon: ShoppingCart,
  },
  { id: 'defense' as const, label: 'Defense', Icon: Shield },
  { id: 'lots' as const, label: 'Lots', Icon: LayoutGrid },
  {
    id: 'leaderboard' as const,
    label: 'Scores',
    Icon: Trophy,
  },
] as const;

export type GameTopNavItem = (typeof GAME_TOP_NAV_ITEMS)[number];

export type GameFabActionItem = (typeof GAME_FAB_ACTION_ITEMS)[number];

export type GameScreen = GameTopNavItem['id'] | GameFabActionItem['id'];
