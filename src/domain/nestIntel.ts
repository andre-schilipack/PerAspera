import { NEST_RING_DISTANCE, NEST_STRUCTURE_MAX_HP } from './constants.ts';
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

export function findRobotNestFeature(
  features: readonly HexTileFeature[] | undefined,
): HexTileRobotNestFeature | undefined {
  return features?.find(isHexTileRobotNestFeature);
}

export function tileHasRobotNest(tile: HexTile): boolean {
  return findRobotNestFeature(tile.features) != null;
}

/** Ensure nest feature has HP fields (older saves may omit them). */
export function normalizeRobotNestFeature(
  f: HexTileRobotNestFeature,
): HexTileRobotNestFeature {
  const maxHp =
    typeof f.maxHp === 'number' && f.maxHp > 0
      ? Math.floor(f.maxHp)
      : NEST_STRUCTURE_MAX_HP;
  const currentHp =
    typeof f.currentHp === 'number' && Number.isFinite(f.currentHp)
      ? Math.max(0, Math.min(maxHp, Math.floor(f.currentHp)))
      : maxHp;
  return { type: 'robot_nest', currentHp, maxHp };
}

export function upsertRobotNestFeatureHp(
  tile: HexTile,
  currentHp: number,
  maxHp: number = NEST_STRUCTURE_MAX_HP,
): HexTile {
  const max = Math.max(1, Math.floor(maxHp));
  const hp = Math.max(0, Math.min(max, Math.floor(currentHp)));
  const nest: HexTileRobotNestFeature = {
    type: 'robot_nest',
    currentHp: hp,
    maxHp: max,
  };
  const prev = tile.features ?? [];
  const without = prev.filter((f) => !isHexTileRobotNestFeature(f));
  return { ...tile, features: [...without, nest] };
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
  let next: HexMap = {
    ...hexMap,
    nestHexId,
    enemyNestDiscovered,
  };

  // Normalize HP on an already-discovered nest feature.
  if (enemyNestDiscovered && nestHexId && next.hexes[nestHexId]) {
    const tile = next.hexes[nestHexId]!;
    const nest = findRobotNestFeature(tile.features);
    if (nest) {
      const normalized = normalizeRobotNestFeature(nest);
      if (
        normalized.currentHp !== nest.currentHp ||
        normalized.maxHp !== nest.maxHp
      ) {
        next = {
          ...next,
          hexes: {
            ...next.hexes,
            [nestHexId]: upsertRobotNestFeatureHp(
              tile,
              normalized.currentHp,
              normalized.maxHp,
            ),
          },
        };
      }
    } else {
      next = {
        ...next,
        hexes: {
          ...next.hexes,
          [nestHexId]: upsertRobotNestFeatureHp(
            tile,
            NEST_STRUCTURE_MAX_HP,
            NEST_STRUCTURE_MAX_HP,
          ),
        },
      };
    }
  }

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

  const withNest = upsertRobotNestFeatureHp(
    tile,
    NEST_STRUCTURE_MAX_HP,
    NEST_STRUCTURE_MAX_HP,
  );

  return {
    ...hexMap,
    enemyNestDiscovered: true,
    hexes: {
      ...hexMap.hexes,
      [nestHexId]: withNest,
    },
  };
}

/** Player-facing chronicle line when the Quartel confirms the nest (PT-BR). */
export function nestDiscoveryChronicleText(nestHexId: string): string {
  return `Quartel General confirmou um ninho robótico em ${nestHexId}. Ofensiva liberada no mural.`;
}

export function nestSortieChronicleText(params: {
  outcome: 'victory' | 'defeat' | 'interrupted';
  nestHexId: string;
  threatReduced: number;
}): string {
  const threatBit =
    params.threatReduced > 0.05
      ? ` Ameaça da cidade −${params.threatReduced.toFixed(1)}.`
      : '';
  if (params.outcome === 'victory') {
    return `Ofensiva em ${params.nestHexId}: ninho derrubado.${threatBit}`;
  }
  if (params.outcome === 'interrupted') {
    return `Ofensiva em ${params.nestHexId}: força recuou — ataque interrompido.${threatBit}`;
  }
  return `Ofensiva em ${params.nestHexId}: força abatida.${threatBit}`;
}
