export type ItemType =
  | 'consumable'
  | 'tool'
  | 'material'
  | 'weapon'
  | 'upgrade'
  | 'repair_material';

export type ItemRarity = 'comum' | 'raro' | 'épico';

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  /** Base price at the municipal market. */
  value: number;
  /** Numeric effect payload, e.g. { staminaBoost: 20 }, { repairAmount: 25 }. */
  effects: Record<string, number>;
  quantity: number;
}
