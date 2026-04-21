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
};

export function getMoveTemplate(id: MoveTemplateId): MoveTemplate | undefined {
  return MOVE_CATALOG[id];
}
