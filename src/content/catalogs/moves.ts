import type { MoveTemplate, MoveTemplateId } from '../../domain/types/combat.ts';

/** Catalog of combat move templates (stable id → definition). Extend in future iterations. */
export const MOVE_CATALOG: Record<string, MoveTemplate> = {
  basic_attack: {
    id: 'basic_attack',
    name: 'Basic attack',
    description: 'A straight physical strike.',
    damageKind: 'physical',
    targets: 'single',
    cost: 0,
    power: { mode: 'flat', basePower: 10 },
    tags: ['single'],
  },
  /** INT-scaled alternative for autoplay tests and future builds. */
  int_spike: {
    id: 'int_spike',
    name: 'JIT spike',
    description: 'A fast exploit — power scales with Intelligence.',
    damageKind: 'hack',
    targets: 'single',
    cost: 0,
    power: {
      mode: 'scaleAttribute',
      attribute: 'intelligence',
      coefficient: 5,
      base: 4,
    },
    tags: ['hack', 'single'],
  },
};

export function getMoveTemplate(id: MoveTemplateId): MoveTemplate | undefined {
  return MOVE_CATALOG[id];
}
