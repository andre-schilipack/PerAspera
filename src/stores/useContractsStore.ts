import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Contract } from '../domain/types/index.ts';

interface ContractsActions {
  upsertContract: (contract: Contract) => void;
  patchContract: (
    contractId: string,
    patch: Partial<Contract>,
  ) => void;
  reset: () => void;
}

type ContractsState = {
  contracts: Record<string, Contract>;
};

type ContractsStore = ContractsState & ContractsActions;

const initialContractsState = (): ContractsState => ({
  contracts: {},
});

export const useContractsStore = create<ContractsStore>()(
  persist(
    (set) => ({
      ...initialContractsState(),
      upsertContract: (contract) =>
        set((s) => ({
          contracts: { ...s.contracts, [contract.id]: contract },
        })),
      patchContract: (contractId, patch) =>
        set((s) => {
          const prev = s.contracts[contractId];
          if (!prev) return s;
          return {
            contracts: {
              ...s.contracts,
              [contractId]: { ...prev, ...patch },
            },
          };
        }),
      reset: () => set(initialContractsState()),
    }),
    {
      name: 'peraspera-contracts',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        contracts: state.contracts,
      }),
    },
  ),
);
