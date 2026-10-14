export type ContractType = 'expansion' | 'offensive';

export type ContractStatus = 'open' | 'completed';

export interface Contract {
  id: string;
  type: ContractType;
  /** Issuer — Quartel NPC for expansion missions. */
  ownerId: string;
  targetHexId: string;
  charSlots: number;
  enlistedCharacterIds: string[];
  staminaCost: number;
  status: ContractStatus;
  createdAt: number;
}
