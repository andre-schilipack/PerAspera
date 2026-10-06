import { pickAutoplayMoveTemplate } from '../../autobattle/autoplayStrike.ts';
import { combatBeatPhaseFromTurns } from '../../autobattle/combatBeatPhase.ts';
import type { MoveTemplate } from '../../types/combat.ts';
import type { UnitId } from '../core/events.ts';
import type { BattleState, UnitState } from '../core/types.ts';

import type { PolicyDecision } from './policy.ts';

/** Team id → living unit ids. Missing teams are absent. */
export type LivingIdsByTeam = Readonly<Record<string, ReadonlySet<string> | undefined>>;

export function isSkillActionable(actor: UnitState, template: MoveTemplate): boolean {
  const cd = actor.cooldowns[template.id] ?? 0;
  if (cd > 0) return false;
  if (template.effect.kind === 'selfBuff') {
    const remaining = actor.statuses[template.effect.statusId] ?? 0;
    if (remaining > 0) return false;
  }
  const manaCost = Math.max(0, Math.floor(template.cost ?? 0));
  if (actor.mana < manaCost) return false;
  return true;
}

function averageEnemyHpFraction(
  state: BattleState,
  actor: UnitState,
  livingByTeam: LivingIdsByTeam,
): number {
  let sum = 0;
  let count = 0;
  for (const [teamId, ids] of Object.entries(livingByTeam)) {
    if (teamId === actor.teamId) continue;
    if (!ids) continue;
    for (const id of ids) {
      const u = state.unitsById[id];
      if (!u || !u.alive || u.retreated) continue;
      sum += u.maxHp > 0 ? u.hp / u.maxHp : 0;
      count++;
    }
  }
  return count > 0 ? sum / count : 1;
}

function pickSkillTemplate(params: {
  actor: UnitState;
  state: BattleState;
  rng: () => number;
  getSkillTemplate: (id: string) => MoveTemplate | undefined;
  livingByTeam: LivingIdsByTeam;
}): MoveTemplate | null {
  const { actor, state, rng, getSkillTemplate, livingByTeam } = params;
  const available = actor.skillIds.filter((id) => {
    const t = getSkillTemplate(id);
    return t ? isSkillActionable(actor, t) : false;
  });
  if (available.length === 0) return null;
  const defenderFrac = averageEnemyHpFraction(state, actor, livingByTeam);
  const beat = combatBeatPhaseFromTurns({
    turn: Math.max(1, state.tick + 1),
    attackerHpFraction: actor.maxHp > 0 ? actor.hp / actor.maxHp : 0,
    defenderHpFraction: defenderFrac,
  });
  return pickAutoplayMoveTemplate(
    available,
    getSkillTemplate,
    actor.attributes,
    { combatBeatPhase: beat, defenderHpFraction: defenderFrac, rng },
  );
}

/**
 * Hands-off policy. Retreat roll happens before the skill pick, matching the
 * previous in-loop order so RNG streams stay stable.
 * An empty skillId means "approach or strike this target" (no cast).
 */
export function decideAutoplay(params: {
  actor: UnitState;
  state: BattleState;
  nearestEnemyId: UnitId;
  livingByTeam: LivingIdsByTeam;
  rng: () => number;
  getSkillTemplate: (id: string) => MoveTemplate | undefined;
  retreatHpFraction: number;
  retreatChance: number;
}): PolicyDecision {
  const { actor, rng } = params;
  const actorHpFrac = actor.maxHp > 0 ? actor.hp / actor.maxHp : 0;
  if (
    !actor.immobile &&
    !actor.vital &&
    actorHpFrac <= params.retreatHpFraction &&
    rng() < params.retreatChance
  ) {
    return { kind: 'retreat' };
  }
  const picked = pickSkillTemplate(params);
  return {
    kind: 'use',
    skillId: picked?.id ?? '',
    targetId: params.nearestEnemyId,
  };
}
