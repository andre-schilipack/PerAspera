import type { BattleReel } from '../domain/types/battleArchive.ts';
import { useBattleArchiveStore } from '../stores/useBattleArchiveStore.ts';

export function recordBattleReel(reel: BattleReel): number {
  return useBattleArchiveStore.getState().append(reel);
}

export function recordBattleReels(reels: readonly BattleReel[] | undefined): void {
  if (!reels) return;
  for (const reel of reels) recordBattleReel(reel);
}
