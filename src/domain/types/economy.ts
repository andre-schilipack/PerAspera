export type BusinessKind = 'loja' | 'industria' | 'fazenda' | 'outro';

/** Pending passive item quantities (float); templateId → units. */
export type PassiveItemBuffer = Record<string, number>;

export interface Business {
  id: string;
  name: string;
  type: BusinessKind;
  level: number;
  /** Baseline daily passive units for production types (items/day into buffer). */
  productionRate: number;
  lastProduction: number;
  outputItemId?: string;
  workerSlots: number;
  workersAssigned: number;
  /** Per worker; charged to owner once per {@link ECONOMIC_TICKS_PER_WAGE_DAY} ticks. */
  wagePerDay: number;
  /** Production: item stockpile; loja: typically empty here. */
  passiveItemBuffer: PassiveItemBuffer;
  /** Loja only: creds from simulated/future sales (float). */
  credsPending: number;
}
