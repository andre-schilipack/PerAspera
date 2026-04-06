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
 * Primary navigation: top bar + mobile FAB share this config.
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

export type GameScreen = (typeof GAME_NAV_ITEMS)[number]['id'];
