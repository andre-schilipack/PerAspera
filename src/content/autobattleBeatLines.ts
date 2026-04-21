import type { CombatBeatPhase } from '../domain/types/combat.ts';

/** Short system line when the tactical beat shifts (race-like pacing). */
export function lineCombatBeatShift(phase: CombatBeatPhase): string {
  switch (phase) {
    case 'approach':
      return 'Range closes — opening moves.';
    case 'contact':
      return 'Lines collide — the real exchange begins.';
    case 'endgame':
      return 'Margins vanish — everything rides on the next beats.';
    default:
      return '';
  }
}
