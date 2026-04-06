import { useSyncExternalStore } from 'react';

/**
 * Subscribes to window.matchMedia. Safe for Vite CSR.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Primary nav uses the top bar; FAB is used below this width. */
export const GAME_NAV_WIDE_MEDIA = '(min-width: 721px)';
