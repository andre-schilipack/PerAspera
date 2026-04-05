/**
 * Axial coordinates (q, r) for pointy-top hex grids.
 * @see https://www.redblobgames.com/grids/hexagons/
 */

export interface AxialCoord {
  q: number;
  r: number;
}

const AXIAL_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Stable map key: "q,r" (no spaces). */
export function hexKeyFromAxial(q: number, r: number): string {
  return `${q},${r}`;
}

export function parseHexKey(key: string): AxialCoord | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const q = Number(parts[0]);
  const r = Number(parts[1]);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
  return { q, r };
}

export function axialNeighbors(q: number, r: number): AxialCoord[] {
  return AXIAL_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/** Integer hex distance (axial / cube equivalence). */
export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function isAxialNeighbor(a: AxialCoord, b: AxialCoord): boolean {
  return axialDistance(a, b) === 1;
}
