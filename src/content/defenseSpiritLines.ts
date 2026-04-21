export function lineBucketPressureSnapshot(params: {
  front: number;
  ranged: number;
  support: number;
}): string {
  const { front, ranged, support } = params;
  return `Lines — Front: ${String(front)} · Ranged: ${String(ranged)} · Support: ${String(support)} hostiles.`;
}

export function lineAllySpiritShift(delta: number, total: number): string {
  if (delta === 0) return `City resolve holds at ${String(total)}.`;
  const sign = delta > 0 ? '+' : '';
  return `Collective nerve ${sign}${String(delta)} → ${String(total)}.`;
}

export function lineMoraleShockHits(): string {
  return 'Morale shock — the line hesitates!';
}

export function lineSupportStabilizes(): string {
  return 'Support cadre steadies firing discipline.';
}
