import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MarketOrder } from '../domain/orderBook.ts';

interface MarketStore {
  orders: MarketOrder[];
  setOrders: (orders: MarketOrder[]) => void;
  reset: () => void;
}

export const useMarketStore = create<MarketStore>()(
  persist(
    (set) => ({
      orders: [],
      setOrders: (orders) => set({ orders }),
      reset: () => set({ orders: [] }),
    }),
    {
      name: 'peraspera-market',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ orders: state.orders }),
    },
  ),
);
