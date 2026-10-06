import type { UnitId } from '../core/events.ts';

/** What a policy emits on an actor's turn. The simulator resolves range, cost, and events. */
export type PolicyDecision =
  | { kind: 'retreat' }
  | { kind: 'wait' }
  | { kind: 'use'; skillId: string; targetId: UnitId };

export type AlgoCondition =
  | { kind: 'foe_nearest' }
  | { kind: 'foe_hp_at_most'; percent: number }
  | { kind: 'ally_hp_at_most'; percent: number }
  | { kind: 'self_hp_at_most'; percent: number }
  | { kind: 'self' };

export type AlgoAction =
  | { kind: 'retreat' }
  | { kind: 'wait' }
  | { kind: 'skill'; skillId: string };

/** Index 0 is the highest priority. */
export interface AlgoRule {
  enabled: boolean;
  when: AlgoCondition;
  do: AlgoAction;
}

export interface AlgoProgram {
  rules: readonly AlgoRule[];
}

export function conditionNeedsPercent(kind: AlgoCondition['kind']): boolean {
  return kind === 'foe_hp_at_most' || kind === 'ally_hp_at_most' || kind === 'self_hp_at_most';
}
