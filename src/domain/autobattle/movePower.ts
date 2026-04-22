import type { CoreAttributes } from '../types/attributes.ts';
import type { MovePower, MoveTemplate } from '../types/combat.ts';

/**
 * Computes pre-mitigation effect strength for offensive moves (MVP: integer "power").
 * Healing/support moves can reuse this as a magnitude or get a dedicated path later.
 */
export function computeRawPower(
  template: MoveTemplate,
  attacker: CoreAttributes,
): number {
  const p: MovePower = template.power;
  if (p.mode === 'flat') {
    return Math.max(0, Math.floor(p.basePower));
  }
  if (p.mode === 'scaleSum') {
    const base = p.base ?? 0;
    let sum = base;
    for (const term of p.terms) {
      sum += term.coefficient * attacker[term.attribute];
    }
    return Math.max(0, Math.floor(sum));
  }
  const base = p.base ?? 0;
  const attrVal = attacker[p.attribute];
  return Math.max(0, Math.floor(base + p.coefficient * attrVal));
}
