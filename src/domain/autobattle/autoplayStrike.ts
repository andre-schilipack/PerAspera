import type { CoreAttributes } from '../types/attributes.ts';
import type { MoveTemplate, MoveTemplateId } from '../types/combat.ts';
import type { MeleeResolveResult } from '../combatResolution.ts';

import { computeRawPower } from './movePower.ts';
import { pickAutoplaySkill, type AutoplaySkillPickContext } from './skillPick.ts';
import { resolveStrikeDamage } from './damageResolution.ts';

/**
 * Resolves catalog pick + `basic_attack` fallback (shared by street skirmish and mass defense).
 */
export function pickAutoplayMoveTemplate(
  skillIds: readonly MoveTemplateId[],
  getTemplate: (id: MoveTemplateId) => MoveTemplate | undefined,
  attackerAttributes: CoreAttributes,
  ctx: AutoplaySkillPickContext,
): MoveTemplate {
  const picked =
    pickAutoplaySkill(skillIds, getTemplate, attackerAttributes, ctx) ??
    getTemplate('basic_attack');
  const template = picked ?? getTemplate('basic_attack');
  if (!template) {
    throw new Error('MOVE_CATALOG missing basic_attack');
  }
  return template;
}

export interface ResolveMoveTemplateStrikeParams {
  template: MoveTemplate;
  attackerAttributes: CoreAttributes;
  defenderReceivingStrike: CoreAttributes;
  rng: () => number;
  /** Applied after {@link computeRawPower} (floor). Default 1. */
  strikePowerMultiplier?: number;
}

/**
 * Raw power from template + attacker stats, optional scaling, then unified strike resolution.
 */
export function resolveMoveTemplateStrike(
  params: ResolveMoveTemplateStrikeParams,
): MeleeResolveResult {
  let rawPower = computeRawPower(params.template, params.attackerAttributes);
  const mul = params.strikePowerMultiplier ?? 1;
  rawPower = Math.max(1, Math.floor(rawPower * mul));
  return resolveStrikeDamage(
    rawPower,
    params.template.damageKind,
    params.defenderReceivingStrike,
    params.rng,
  );
}
