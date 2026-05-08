import type { AxialCoord } from '../../hex.ts';
import type { TileId } from '../core/events.ts';

export interface IHexGrid {
  parseTileId(tileId: TileId): AxialCoord | null;
  tileIdFromAxial(coord: AxialCoord): TileId;
  neighbors(tileId: TileId): readonly TileId[];
  distance(a: TileId, b: TileId): number;
  isAdjacent(a: TileId, b: TileId): boolean;
}

