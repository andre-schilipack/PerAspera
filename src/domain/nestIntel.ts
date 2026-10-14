import { NEST_RING_DISTANCE } from './constants.ts';
import {
  axialDistance,
  hexKeyFromAxial,
  listAxialAtDistance,
  parseHexKey,
  type AxialCoord,
} from './hex.ts';
import type {
  HexMap,
  HexTile,
  HexTileFeature,
  HexTileRobotNestFeature,
} from './types/map.ts';

const ORIGIN: AxialCoord = { q: 0, r: 0 };

export function isHexTileRobotNestFeature(
  f: HexTileFeature,
): f is HexTileRobotNestFeature {
  return f.type === 'robot_nest';
}

export function tileHasRobotNest(tile: HexTile): boolean {
  return tile.features?.some(isHexTileRobotNestFeature) ?? false;
}

/** Pick a random hex id on the nest ring (distance {@link NEST_RING_DISTANCE} from Centro). */
export function pickNestHexId(rng: () => number = Math.random): string {
  const ring = listAxialAtDistance(NEST_RING_DISTANCE);
  if (ring.length === 0) {
    throw new Error('pickNestHexId: empty nest ring');
  }
  const i = Math.min(ring.length - 1, Math.floor(rng() * ring.length));
  const c = ring[i]!;
  return hexKeyFromAxial(c.q, c.r);
}

export function nestHexIdDistanceFromOrigin(nestHexId: string): number | null {
  const c = parseHexKey(nestHexId);
  if (!c) return null;
  return axialDistance(c, ORIGIN);
}

/**
 * Ensure nest intel fields exist on a loaded map. Does not discover.
 * Returns whether the nest hex is already unlocked and discovery still pending
 * (caller should run discovery side effects).
 */
export function normalizeHexMapNestIntel(
  hexMap: HexMap,
  rng: () => number = Math.random,
): {
  hexMap: HexMap;
  pendingDiscovery: boolean;
} {
  const nestHexId =
    typeof hexMap.nestHexId === 'string' && hexMap.nestHexId.length > 0
      ? hexMap.nestHexId
      : pickNestHexId(rng);
  const enemyNestDiscovered = hexMap.enemyNestDiscovered === true;
  const next: HexMap = {
    ...hexMap,
    nestHexId,
    enemyNestDiscovered,
  };
  const nestTile = next.hexes[nestHexId];
  const pendingDiscovery =
    !enemyNestDiscovered && nestTile != null && nestTile.isUnlocked;
  return { hexMap: next, pendingDiscovery };
}

/**
 * Mark nest discovered and attach `robot_nest` feature on the nest tile.
 * Idempotent: returns null if already discovered or nest id missing / tile absent.
 */
export function applyNestDiscoveryToMap(hexMap: HexMap): HexMap | null {
  if (hexMap.enemyNestDiscovered) return null;
  const nestHexId = hexMap.nestHexId;
  if (!nestHexId) return null;
  const tile = hexMap.hexes[nestHexId];
  if (!tile || !tile.isUnlocked) return null;

  const features: HexTileFeature[] = [...(tile.features ?? [])];
  if (!features.some(isHexTileRobotNestFeature)) {
    features.push({ type: 'robot_nest' });
  }

  return {
    ...hexMap,
    enemyNestDiscovered: true,
    hexes: {
      ...hexMap.hexes,
      [nestHexId]: {
        ...tile,
        features,
      },
    },
  };
}

/** Player-facing chronicle line when the Quartel confirms the nest (PT-BR). */
export function nestDiscoveryChronicleText(nestHexId: string): string {
  return `Quartel General confirmou um ninho robótico em ${nestHexId}. Ofensiva liberada no mural.`;
}
