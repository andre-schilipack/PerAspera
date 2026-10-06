import type { MoveTemplate } from '../../types/combat.ts';
import { softHexGrid } from '../grid/softHexGrid.ts';
import type { UnitId } from '../core/events.ts';
import type { BattleState, UnitState } from '../core/types.ts';

import { isSkillActionable, type LivingIdsByTeam } from './autoplayPolicy.ts';
import type { AlgoCondition, AlgoProgram, PolicyDecision } from './policy.ts';

function hpFraction(unit: UnitState): number {
  return unit.maxHp > 0 ? unit.hp / unit.maxHp : 0;
}

function nearestEnemyId(
  state: BattleState,
  actor: UnitState,
  livingByTeam: LivingIdsByTeam,
): UnitId | null {
  let best: { id: UnitId; dist: number; hp: number } | null = null;
  for (const [teamId, ids] of Object.entries(livingByTeam)) {
    if (teamId === actor.teamId || !ids) continue;
    for (const id of ids) {
      const u = state.unitsById[id];
      if (!u || !u.alive || u.retreated) continue;
      const dist = softHexGrid.distance(actor.tileId, u.tileId);
      if (!Number.isFinite(dist)) continue;
      const cand = { id: u.unitId, dist, hp: u.hp };
      if (!best) {
        best = cand;
        continue;
      }
      if (
        cand.dist < best.dist ||
        (cand.dist === best.dist &&
          (cand.hp < best.hp || (cand.hp === best.hp && cand.id < best.id)))
      ) {
        best = cand;
      }
    }
  }
  return best?.id ?? null;
}

/** Most wounded living ally at or below `maxFraction`, including the actor. */
function allyAtMostHp(
  state: BattleState,
  actor: UnitState,
  livingByTeam: LivingIdsByTeam,
  maxFraction: number,
): UnitId | null {
  const allyIds = livingByTeam[actor.teamId];
  if (!allyIds) return null;
  let best: { id: UnitId; frac: number } | null = null;
  for (const id of allyIds) {
    const u = state.unitsById[id];
    if (!u || !u.alive || u.retreated) continue;
    const frac = hpFraction(u);
    if (frac > maxFraction) continue;
    const cand = { id: u.unitId, frac };
    if (!best || cand.frac < best.frac || (cand.frac === best.frac && cand.id < best.id)) {
      best = cand;
    }
  }
  return best?.id ?? null;
}

function matchCondition(
  when: AlgoCondition,
  state: BattleState,
  actor: UnitState,
  livingByTeam: LivingIdsByTeam,
): UnitId | null {
  switch (when.kind) {
    case 'foe_nearest':
      return nearestEnemyId(state, actor, livingByTeam);
    case 'foe_hp_at_most': {
      const id = nearestEnemyId(state, actor, livingByTeam);
      if (!id) return null;
      const foe = state.unitsById[id];
      if (!foe || hpFraction(foe) > when.percent / 100) return null;
      return id;
    }
    case 'ally_hp_at_most':
      return allyAtMostHp(state, actor, livingByTeam, when.percent / 100);
    case 'self_hp_at_most':
      return hpFraction(actor) <= when.percent / 100 ? actor.unitId : null;
    case 'self':
      return actor.unitId;
    default:
      return null;
  }
}

function skillReady(
  actor: UnitState,
  skillId: string,
  getSkillTemplate: (id: string) => MoveTemplate | undefined,
): boolean {
  if (!actor.skillIds.includes(skillId)) return false;
  const template = getSkillTemplate(skillId);
  if (!template) return false;
  return isSkillActionable(actor, template);
}

/**
 * First enabled rule whose condition matches and whose action can run.
 * No match yields wait. Immobile and vital units skip retreat and keep walking the list.
 */
export function decideAlgo(params: {
  actor: UnitState;
  program: AlgoProgram;
  state: BattleState;
  livingByTeam: LivingIdsByTeam;
  getSkillTemplate: (id: string) => MoveTemplate | undefined;
}): PolicyDecision {
  const { actor, program, state, livingByTeam, getSkillTemplate } = params;
  for (const rule of program.rules) {
    if (!rule.enabled) continue;
    const targetId = matchCondition(rule.when, state, actor, livingByTeam);
    if (!targetId) continue;
    if (rule.do.kind === 'retreat') {
      if (actor.immobile || actor.vital) continue;
      return { kind: 'retreat' };
    }
    if (rule.do.kind === 'wait') return { kind: 'wait' };
    if (!skillReady(actor, rule.do.skillId, getSkillTemplate)) continue;
    return { kind: 'use', skillId: rule.do.skillId, targetId };
  }
  return { kind: 'wait' };
}
