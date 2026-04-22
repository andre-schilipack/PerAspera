import type { CoreAttributes } from '../types/attributes.ts';
import type { CombatBeatPhase, MoveTemplate, MoveTemplateId } from '../types/combat.ts';

import { computeRawPower } from './movePower.ts';

export interface AutoplaySkillPickContext {
  combatBeatPhase: CombatBeatPhase;
  /** Target HP fraction (0–1), for execute / finisher bias. */
  defenderHpFraction: number;
  /** Uniform [0, 1); injected for deterministic tests. */
  rng: () => number;
}

const TACTICAL_TAGS = new Set([
  'debuff',
  'control',
  'hack',
]);

/**
 * Higher score wins the autoplay pick. INT prefers tactical templates and INT-scaled power.
 */
export function scoreSkillTemplate(
  template: MoveTemplate,
  attrs: CoreAttributes,
  ctx: AutoplaySkillPickContext,
): number {
  const int = attrs.intelligence;
  const estimated = computeRawPower(template, attrs);
  let score = 1 + estimated * 0.06 + ctx.rng() * 0.002;

  const tactical = template.tags.some((t) => TACTICAL_TAGS.has(t));
  if (tactical) {
    score += int * 0.22;
  }

  const p = template.power;
  if (p.mode === 'scaleAttribute' && p.attribute === 'intelligence') {
    score += int * p.coefficient * 0.45;
  }
  if (p.mode === 'scaleSum') {
    for (const term of p.terms) {
      if (term.attribute === 'intelligence') {
        score += int * term.coefficient * 0.38;
      }
      if (term.attribute === 'charisma') {
        score += attrs.charisma * term.coefficient * 0.28;
      }
      if (term.attribute === 'agility') {
        score += attrs.agility * term.coefficient * 0.22;
      }
    }
  }

  const lowOffenseBuff =
    template.tags.includes('buff') &&
    estimated < 5 &&
    !template.tags.includes('burst');

  switch (ctx.combatBeatPhase) {
    case 'approach':
      if (template.tags.includes('buff')) score += 0.6;
      break;
    case 'endgame':
      if (template.tags.includes('execute')) {
        score += 1.4 + int * 0.08;
      }
      if (ctx.defenderHpFraction <= 0.28 && template.tags.includes('burst')) {
        score += 0.8;
      }
      break;
    default:
      break;
  }

  if (lowOffenseBuff && ctx.combatBeatPhase !== 'approach') {
    score *= 0.38;
  }

  return score;
}

export function pickAutoplaySkill(
  skillIds: readonly MoveTemplateId[],
  getTemplate: (id: MoveTemplateId) => MoveTemplate | undefined,
  attrs: CoreAttributes,
  ctx: AutoplaySkillPickContext,
): MoveTemplate | null {
  const candidates: MoveTemplate[] = [];
  for (const id of skillIds) {
    const t = getTemplate(id);
    if (t) candidates.push(t);
  }
  if (candidates.length === 0) return null;

  let best = candidates[0]!;
  let bestScore = scoreSkillTemplate(best, attrs, ctx);
  for (let i = 1; i < candidates.length; i++) {
    const t = candidates[i]!;
    const s = scoreSkillTemplate(t, attrs, ctx);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}
