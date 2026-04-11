import type { SectionIntegrity, WallCardinal, WallState } from './types/defense.ts';

export function clampSectionIntegrity(section: SectionIntegrity): SectionIntegrity {
  const max = Math.max(0, section.max);
  const current = Math.min(max, Math.max(0, section.current));
  return {
    ...section,
    max,
    current,
    breached: current <= 0 || section.breached,
  };
}

/**
 * Apply structural damage to one wall section (current decreases).
 */
export function applyDamageToWallSection(
  wall: WallState,
  side: WallCardinal,
  damage: number,
): WallState {
  if (damage <= 0) return wall;
  const prev = wall.sections[side];
  const nextCurrent = Math.max(0, prev.current - damage);
  const sections = {
    ...wall.sections,
    [side]: clampSectionIntegrity({
      ...prev,
      current: nextCurrent,
      breached: nextCurrent <= 0 || prev.breached,
    }),
  };
  return {
    ...wall,
    sections,
    lastAttackedSection: side,
  };
}

/**
 * Repair integrity on one section (current increases toward max). Spends `credsCost` outside this pure fn.
 */
export function repairWallSection(
  wall: WallState,
  side: WallCardinal,
  points: number,
): WallState {
  if (points <= 0) return wall;
  const prev = wall.sections[side];
  const nextCurrent = Math.min(prev.max, prev.current + points);
  const sections = {
    ...wall.sections,
    [side]: clampSectionIntegrity({
      ...prev,
      current: nextCurrent,
      breached: nextCurrent <= 0 ? prev.breached : false,
    }),
  };
  return {
    ...wall,
    sections,
    lastRepairedDate: wall.lastRepairedDate,
  };
}
