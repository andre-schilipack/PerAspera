import {
  axialNeighbors,
  axialDistance,
  isAxialNeighbor,
  parseHexKey,
  type AxialCoord,
} from '../../hex.ts';
import type { TileId } from '../core/events.ts';
import type { IHexGrid } from './IHexGrid.ts';

export const softHexGrid: IHexGrid = {
  parseTileId(tileId: TileId): AxialCoord | null {
    return parseHexKey(tileId);
  },
  tileIdFromAxial(coord: AxialCoord): TileId {
    return `${coord.q},${coord.r}`;
  },
  neighbors(tileId: TileId): readonly TileId[] {
    const c = parseHexKey(tileId);
    if (!c) return [];
    return axialNeighbors(c.q, c.r).map((n) => `${n.q},${n.r}`);
  },
  distance(a: TileId, b: TileId): number {
    const ac = parseHexKey(a);
    const bc = parseHexKey(b);
    if (!ac || !bc) return Infinity;
    return axialDistance(ac, bc);
  },
  isAdjacent(a: TileId, b: TileId): boolean {
    const ac = parseHexKey(a);
    const bc = parseHexKey(b);
    if (!ac || !bc) return false;
    return isAxialNeighbor(ac, bc);
  },
};

