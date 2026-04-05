export type BusinessKind = 'loja' | 'industria' | 'fazenda' | 'outro';

export interface Business {
  id: string;
  name: string;
  type: BusinessKind;
  level: number;
  /** Output units per day (or per 5 STA tick — design choice at gameplay layer). */
  productionRate: number;
  lastProduction: number;
  outputItemId?: string;
  workers?: number;
}
