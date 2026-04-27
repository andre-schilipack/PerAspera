import type { MoveTemplate, MoveTemplateId } from '../../domain/types/combat.ts';

/** Stable id for tower ranged move (damage band still rolled in defense combat). */
export const MOVE_ID_TOWER_RAJADA = 'tower_rajada' as const satisfies MoveTemplateId;

/** Stable id for guard ranged move (damage band still rolled in defense combat). */
export const MOVE_ID_GUARD_DISPARO = 'guard_disparo' as const satisfies MoveTemplateId;

/**
 * Skills any player character may equip in their loadout (NPC-only moves excluded).
 * Learning / unlocking new skills is planned for later.
 */
export const PLAYER_COMBAT_SKILL_POOL = [
  'basic_attack',
  'int_spike',
  'defensive_stance',
  'fireball',
  'cure',
  'be_like_water',
  'concentration',
] as const satisfies readonly MoveTemplateId[];

/** Catalog of combat move templates (stable id → definition). Extend in future iterations. */
export const MOVE_CATALOG: Record<string, MoveTemplate> = {
  basic_attack: {
    id: 'basic_attack',
    name: 'Basic attack',
    description: 'A straight physical strike.',
    effect: { kind: 'damage' },
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
    effect: { kind: 'damage' },
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
  defensive_stance: {
    id: 'defensive_stance',
    name: 'Postura defensiva',
    description:
      '+50% block chance, 3 turn duration. 8 turn cooldown (full effect when turn engine supports it).',
    effect: {
      kind: 'selfBuff',
      statusId: 'defensive_stance',
      label: 'block chance up',
    },
    damageKind: 'physical',
    targets: 'single',
    cost: 0,
    power: { mode: 'flat', basePower: 0 },
    tags: ['buff', 'single'],
    cooldownTurns: 8,
    durationTurns: 3,
  },
  fireball: {
    id: 'fireball',
    name: 'Bola de fogo',
    description:
      'Fire burst across a small hostile cluster; power scales with Intelligence. 5 turn cooldown.',
    effect: { kind: 'damage' },
    damageKind: 'fire',
    targets: 'multi',
    cost: 0,
    power: {
      mode: 'scaleAttribute',
      attribute: 'intelligence',
      coefficient: 5,
      base: 5,
    },
    tags: ['burst', 'ranged', 'aoe'],
    cooldownTurns: 5,
  },
  arc_burst: {
    id: 'arc_burst',
    name: 'Surto elétrico',
    description:
      'Electric discharge across all visible hostiles. Testbed for all-target combat resolution.',
    effect: { kind: 'damage' },
    damageKind: 'electric',
    targets: 'all',
    cost: 0,
    power: {
      mode: 'scaleAttribute',
      attribute: 'intelligence',
      coefficient: 3,
      base: 3,
    },
    tags: ['burst', 'ranged', 'aoe'],
    cooldownTurns: 6,
  },
  cure: {
    id: 'cure',
    name: 'Cura leve',
    description:
      'Restores the most wounded ally. Magnitude scales with Intelligence and Charisma. 3 turn cooldown.',
    effect: { kind: 'heal' },
    damageKind: 'energy',
    targets: 'single',
    cost: 0,
    power: {
      mode: 'scaleSum',
      base: 2,
      terms: [
        { attribute: 'intelligence', coefficient: 2 },
        { attribute: 'charisma', coefficient: 2 },
      ],
    },
    tags: ['buff', 'single'],
    cooldownTurns: 3,
  },
  be_like_water: {
    id: 'be_like_water',
    name: 'Seja como Água',
    description:
      'Evade and counter up (documented); power scales with Agility. 3 turn duration, 7 turn cooldown.',
    effect: {
      kind: 'selfBuff',
      statusId: 'be_like_water',
      label: 'evasion up',
    },
    damageKind: 'physical',
    targets: 'single',
    cost: 0,
    power: {
      mode: 'scaleAttribute',
      attribute: 'agility',
      coefficient: 4,
      base: 2,
    },
    tags: ['buff', 'single'],
    cooldownTurns: 7,
    durationTurns: 3,
  },
  concentration: {
    id: 'concentration',
    name: 'Concentração',
    description:
      'Ranged attack focus — documented buff to ranged offense. 3 turn duration, 4 turn cooldown.',
    effect: {
      kind: 'selfBuff',
      statusId: 'concentration',
      label: 'ranged damage up',
    },
    damageKind: 'physical',
    targets: 'single',
    cost: 0,
    power: { mode: 'flat', basePower: 7 },
    tags: ['buff', 'ranged', 'single'],
    cooldownTurns: 4,
    durationTurns: 3,
  },
  /** Midpoint ~ band for docs; nightly defense rolls raw damage before resolve. */
  [MOVE_ID_TOWER_RAJADA]: {
    id: MOVE_ID_TOWER_RAJADA,
    name: 'Rajada',
    description: 'Heavy emplacement burst toward hostile buckets.',
    effect: { kind: 'damage' },
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
    effect: { kind: 'damage' },
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
