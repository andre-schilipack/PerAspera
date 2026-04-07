/**
 * Pixel layout for pointy-top hexes (axial q, r).
 * @see https://www.redblobgames.com/grids/hexagons/#hex-to-pixel-axial
 */

/** Distance from hex center to any vertex (outer radius), SVG units. */
export const DEFAULT_HEX_PIXEL_RADIUS = 24;

/**
 * Axial (q, r) to pixel center for a pointy-top grid.
 * Y is negated so screen space matches a typical “north up” map (SVG Y grows down).
 */
export function axialToPixelPointyTop(
  q: number,
  r: number,
  size: number = DEFAULT_HEX_PIXEL_RADIUS,
): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = -size * (3 / 2) * r;
  return { x, y };
}

/**
 * Six corners of a pointy-top hex centered at (cx, cy); first vertex at top.
 */
export function hexPolygonPointsPointyTop(
  cx: number,
  cy: number,
  size: number,
): string {
  const parts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    parts.push(
      `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`,
    );
  }
  return parts.join(' ');
}

export interface HexMapBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * ViewBox for an SVG containing all hexes (centers + vertex extent).
 */
export function boundsForHexDisk(
  coords: ReadonlyArray<{ q: number; r: number }>,
  size: number = DEFAULT_HEX_PIXEL_RADIUS,
  padding = 14,
): HexMapBounds {
  if (coords.length === 0) {
    return { minX: 0, minY: 0, width: 100, height: 100 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { q, r } of coords) {
    const { x, y } = axialToPixelPointyTop(q, r, size);
    minX = Math.min(minX, x - size);
    maxX = Math.max(maxX, x + size);
    minY = Math.min(minY, y - size);
    maxY = Math.max(maxY, y + size);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: maxX - minX + 2 * padding,
    height: maxY - minY + 2 * padding,
  };
}

export function viewBoxString(bounds: HexMapBounds): string {
  return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
}
