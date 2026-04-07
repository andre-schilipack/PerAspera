/**
 * District danger / integrity from ring distance (matches world seed math).
 */
export function dangerIntegrityForRingDistance(distanceFromCenter: number): {
  danger: number;
  integrity: number;
} {
  const danger = Math.min(100, 12 + distanceFromCenter * 8);
  const integrity = Math.max(40, 95 - distanceFromCenter * 5);
  return { danger, integrity };
}
