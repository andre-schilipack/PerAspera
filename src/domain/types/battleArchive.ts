import type { BattleResult } from '../combat/core/types.ts';

export type BattleKind = 'expansion' | 'street' | 'nightly' | 'offensive';

/**
 * One finished fight. `battleResult.canonicalEvents` is the replay reel.
 * `unitNames` is required because events store unit ids only.
 */
export interface BattleReel {
  kind: BattleKind;
  at: number;
  title: string;
  outcome: string;
  participantCharacterIds: string[];
  unitNames: Record<string, string>;
  battleResult: BattleResult;
}

export interface BattleArchiveEntry extends BattleReel {
  id: number;
  seenByCharacterIds: string[];
}
