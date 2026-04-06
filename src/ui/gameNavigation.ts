import {
  BookOpen,
  LayoutGrid,
  Map,
  Shield,
  ShoppingCart,
  Trophy,
  User,
} from 'lucide-react';

/**
 * Primary navigation config: wide layout renders a top bar; narrow layout
 * mounts only the FAB (same items — no duplicate nav in the DOM).
 * Map & Profile keep visible text labels on the FAB (per design).
 */
export const GAME_NAV_ITEMS = [
  { id: 'map' as const, label: 'Map', Icon: Map, fabShowLabel: true },
  { id: 'profile' as const, label: 'Profile', Icon: User, fabShowLabel: true },
  {
    id: 'market' as const,
    label: 'Market',
    Icon: ShoppingCart,
    fabShowLabel: false,
  },
  { id: 'defense' as const, label: 'Defense', Icon: Shield, fabShowLabel: false },
  { id: 'lots' as const, label: 'Lots', Icon: LayoutGrid, fabShowLabel: false },
  {
    id: 'leaderboard' as const,
    label: 'Scores',
    Icon: Trophy,
    fabShowLabel: false,
  },
  { id: 'lore' as const, label: 'Lore', Icon: BookOpen, fabShowLabel: false },
] as const;

export type GameNavItem = (typeof GAME_NAV_ITEMS)[number];

export type GameScreen = GameNavItem['id'];
