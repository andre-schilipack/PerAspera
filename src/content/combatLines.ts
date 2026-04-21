import type {
  CombatBeatPhase,
  CombatLogActor,
} from '../domain/types/combat.ts';

/** Short tag shown beside each log line (neon HUD style). */
export const COMBAT_ACTOR_TAG: Record<CombatLogActor, string> = {
  player: 'YOU',
  enemy: 'THREAT',
  system: 'SYS',
  guarda: 'GUARD',
  wall: 'WALL',
};

export function combatActorTag(actor: CombatLogActor): string {
  return COMBAT_ACTOR_TAG[actor];
}

const BEAT_LABEL: Record<CombatBeatPhase, string> = {
  approach: 'OPEN',
  contact: 'CLASH',
  endgame: 'FINISH',
};

export function combatBeatPhaseTag(phase: CombatBeatPhase | undefined): string {
  if (!phase) return '';
  return BEAT_LABEL[phase];
}

/**
 * Demo line for nightly defense tick (until full combat narrative ships).
 */
export function defenseDemoPulseMessage(turn: number): string {
  return `Tick ${String(turn)}: city pulse — wall holds.`;
}
