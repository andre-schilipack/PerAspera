import { MAX_ALGO_RULES } from '../../constants.ts';
import type { CombatLoadout } from '../../types/character.ts';

import type { AlgoAction, AlgoCondition, AlgoProgram, AlgoRule } from './policy.ts';
import { conditionNeedsPercent } from './policy.ts';

const CONDITION_KINDS = new Set<AlgoCondition['kind']>([
  'foe_nearest',
  'foe_hp_at_most',
  'ally_hp_at_most',
  'self_hp_at_most',
  'self',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 50;
  return Math.min(100, Math.max(1, n));
}

function parseCondition(raw: unknown): AlgoCondition | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string') return null;
  if (!CONDITION_KINDS.has(raw.kind as AlgoCondition['kind'])) return null;
  const kind = raw.kind as AlgoCondition['kind'];
  if (!conditionNeedsPercent(kind)) return { kind } as AlgoCondition;
  return { kind, percent: clampPercent(raw.percent) } as AlgoCondition;
}

function parseAction(raw: unknown): AlgoAction | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string') return null;
  if (raw.kind === 'retreat' || raw.kind === 'wait') return { kind: raw.kind };
  if (raw.kind === 'skill' && typeof raw.skillId === 'string' && raw.skillId.length > 0) {
    return { kind: 'skill', skillId: raw.skillId };
  }
  return null;
}

export function sanitizeAlgoRules(raw: unknown): AlgoRule[] {
  if (!Array.isArray(raw)) return [];
  const out: AlgoRule[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const when = parseCondition(item.when);
    const action = parseAction(item.do);
    if (!when || !action) continue;
    out.push({ enabled: item.enabled !== false, when, do: action });
    if (out.length >= MAX_ALGO_RULES) break;
  }
  return out;
}

/** Present only when the loadout opted into AlgoCombat. Empty rules still count. */
export function algoProgramFromLoadout(
  loadout: Pick<CombatLoadout, 'policyMode' | 'algoRules'> | undefined,
): AlgoProgram | undefined {
  if (!loadout || loadout.policyMode !== 'algo') return undefined;
  return { rules: loadout.algoRules ?? [] };
}
