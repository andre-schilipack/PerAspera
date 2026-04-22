import type { MoveTemplate, MoveTemplateId } from '../../domain/types/combat.ts';

/** Stable id for tower ranged move (damage band still rolled in defense combat). */
export const MOVE_ID_TOWER_RAJADA = 'tower_rajada' as const satisfies MoveTemplateId;

/** Stable id for guard ranged move (damage band still rolled in defense combat). */
export const MOVE_ID_GUARD_DISPARO = 'guard_disparo' as const satisfies MoveTemplateId;

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
  /** Midpoint ~ band for docs; nightly defense rolls raw damage before resolve. */
  [MOVE_ID_TOWER_RAJADA]: {
    id: MOVE_ID_TOWER_RAJADA,
    name: 'Rajada',
    description: 'Heavy emplacement burst toward hostile buckets.',
    damageKind: 'physical',
    targets: 'single',
    cost: 0,
    power: { mode: 'flat', basePower: 11 },
    tags: ['burst', 'ranged', 'single'],
  },
  [MOVE_ID_GUARD_DISPARO]: {
    id: MOVE_ID_GUARD_DISPARO,
    name: 'Disparo',
    description: 'Rifle shot at a hostile bucket.',
    damageKind: 'physical',
    targets: 'single',
    cost: 0,
    power: { mode: 'flat', basePower: 7 },
    tags: ['ranged', 'single'],
  },
};

export function getMoveTemplate(id: MoveTemplateId): MoveTemplate | undefined {
  return MOVE_CATALOG[id];
}
