import { getMoveTemplate, MOVE_ID_GUARD_DISPARO, MOVE_ID_TOWER_RAJADA } from '../content/catalogs/moves.ts';
import { resolveStrikeDamage } from './autobattle/index.ts';
import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import type { MoveTemplateId } from './types/combat.ts';
import type { MeleeResolveResult } from './combatResolution.ts';

/**
 * Defender attributes when hostiles evade/block tower or guard fire.
 * Agility/vitality at 0 reproduces legacy {@link resolveIncomingMeleeDamage} baseline
 * dodge/block rates (0.10 / 0.10) via {@link resolveStrikeDamage}.
 */
export const DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES = {
  ...DEFAULT_CORE_ATTRIBUTES,
  agility: 0,
  vitality: 0,
};

/**
 * Applies catalog move identity (damage kind, future resists) to a **pre-rolled** raw hit.
 * Call order must stay: roll raw → bucket/index targeting → this resolver (same RNG stream as before).
 */
export function resolveDefenseNpcCatalogStrike(
  templateId: MoveTemplateId,
  rolledRawDamage: number,
  rng: () => number,
): MeleeResolveResult {
  const template = getMoveTemplate(templateId);
  if (!template) {
    throw new Error(`MOVE_CATALOG missing template: ${templateId}`);
  }
  return resolveStrikeDamage(
    rolledRawDamage,
    template.damageKind,
    DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES,
    rng,
  );
}

export function resolveTowerRajadaStrike(
  rolledRawDamage: number,
  rng: () => number,
): MeleeResolveResult {
  return resolveDefenseNpcCatalogStrike(
    MOVE_ID_TOWER_RAJADA,
    rolledRawDamage,
    rng,
  );
}

export function resolveGuardDisparoStrike(
  rolledRawDamage: number,
  rng: () => number,
): MeleeResolveResult {
  return resolveDefenseNpcCatalogStrike(
    MOVE_ID_GUARD_DISPARO,
    rolledRawDamage,
    rng,
  );
}
