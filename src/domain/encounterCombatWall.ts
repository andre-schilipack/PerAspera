import { CENTER_HEX_ID, DEFAULT_HEX_WALL_MAX_HP } from './constants.ts';
import type { HexMap, HexTile, HexTileCityHallFeature, HexTileFeature, HexTileWallFeature } from './types/map.ts';

/** Legacy persisted wall (four sections) — used only for one-shot migration. */
export interface LegacyWallSection {
  current: number;
  max: number;
  breached?: boolean;
}

export interface LegacyWallStateLike {
  sections: Record<string, LegacyWallSection>;
}

export function aggregateLegacyWallToPool(wall: LegacyWallStateLike): {
  currentHp: number;
  maxHp: number;
} {
  let currentHp = 0;
  let maxHp = 0;
  for (const s of Object.values(wall.sections)) {
    currentHp += Math.max(0, s.current);
    maxHp += Math.max(0, s.max);
  }
  if (maxHp <= 0) {
    return { currentHp: DEFAULT_HEX_WALL_MAX_HP, maxHp: DEFAULT_HEX_WALL_MAX_HP };
  }
  return { currentHp: Math.min(currentHp, maxHp), maxHp };
}

export function isHexTileWallFeature(f: HexTileFeature): f is HexTileWallFeature {
  return f.type === 'wall';
}

export function isHexTileCityHallFeature(
  f: HexTileFeature,
): f is HexTileCityHallFeature {
  return f.type === 'city_hall';
}

export function findWallFeature(
  features: readonly HexTileFeature[] | undefined,
): HexTileWallFeature | undefined {
  return features?.find(isHexTileWallFeature);
}

export function findCityHallFeature(
  features: readonly HexTileFeature[] | undefined,
): HexTileCityHallFeature | undefined {
  return features?.find(isHexTileCityHallFeature);
}

export function ensureWallFeatureOnTile(
  tile: HexTile,
  maxHp: number = DEFAULT_HEX_WALL_MAX_HP,
): HexTile {
  const existing = findWallFeature(tile.features);
  if (existing) return tile;
  const wall: HexTileWallFeature = {
    type: 'wall',
    currentHp: maxHp,
    maxHp,
  };
  const prev = tile.features ?? [];
  return { ...tile, features: [...prev, wall] };
}

export function ensureCityHallFeatureOnTile(
  tile: HexTile,
  currentHp: number,
  maxHp: number,
): HexTile {
  const existing = findCityHallFeature(tile.features);
  if (existing) return tile;
  const hall: HexTileCityHallFeature = {
    type: 'city_hall',
    currentHp,
    maxHp,
  };
  const prev = tile.features ?? [];
  return { ...tile, features: [...prev, hall] };
}

function replaceFeature(
  features: readonly HexTileFeature[],
  next: HexTileFeature,
  match: (f: HexTileFeature) => boolean,
): HexTileFeature[] {
  const list = [...features];
  const i = list.findIndex(match);
  if (i < 0) return [...list, next];
  list[i] = next;
  return list;
}

export function applyDamageToWallOnHexTile(
  tile: HexTile,
  damage: number,
): { tile: HexTile; breached: boolean } {
  if (damage <= 0) {
    const w = findWallFeature(tile.features);
    return { tile, breached: !!(w && w.currentHp <= 0) };
  }
  const w = findWallFeature(tile.features);
  if (!w) {
    const t = ensureWallFeatureOnTile(tile);
    return applyDamageToWallOnHexTile(t, damage);
  }
  const nextCur = Math.max(0, w.currentHp - damage);
  const nextWall: HexTileWallFeature = {
    ...w,
    currentHp: nextCur,
  };
  const breached = nextCur <= 0;
  return {
    tile: {
      ...tile,
      features: replaceFeature(tile.features ?? [], nextWall, isHexTileWallFeature),
    },
    breached,
  };
}

export function repairWallOnHexTile(tile: HexTile, points: number): HexTile {
  if (points <= 0) return tile;
  const w = findWallFeature(tile.features);
  if (!w) return ensureWallFeatureOnTile(tile);
  const nextCur = Math.min(w.maxHp, w.currentHp + points);
  const nextWall: HexTileWallFeature = { ...w, currentHp: nextCur };
  return {
    ...tile,
    features: replaceFeature(tile.features ?? [], nextWall, isHexTileWallFeature),
  };
}

export function applyDamageToCityHallOnHexTile(
  tile: HexTile,
  damage: number,
): { tile: HexTile; collapsed: boolean } {
  const h = findCityHallFeature(tile.features);
  if (!h) {
    return { tile, collapsed: true };
  }
  const nextCur = Math.max(0, h.currentHp - damage);
  const next: HexTileCityHallFeature = { ...h, currentHp: nextCur };
  const collapsed = nextCur <= 0;
  return {
    tile: {
      ...tile,
      features: replaceFeature(tile.features ?? [], next, isHexTileCityHallFeature),
    },
    collapsed,
  };
}

/** Sync Prefeitura slot `structureHp` from `city_hall` feature (keeps UI/tools consistent). */
export function syncPrefeituraSlotStructureHpFromCityHall(tile: HexTile): HexTile {
  const h = findCityHallFeature(tile.features);
  if (!h) return tile;
  const placeSlots = tile.placeSlots.map((slot) => {
    if (slot.type !== 'prefeitura') return slot;
    return {
      ...slot,
      structureHp: { current: h.currentHp, max: h.maxHp },
    };
  });
  return { ...tile, placeSlots };
}

/**
 * Apply structural damage to the `city_hall` feature on the given hex (usually Centro).
 */
export function applyDamageToCityHallStructure(
  hexMap: HexMap,
  cityHallHexId: string,
  rawDamage: number,
): { hexMap: HexMap; collapsed: boolean } {
  const tile = hexMap.hexes[cityHallHexId];
  if (!tile) return { hexMap, collapsed: true };

  const { tile: afterHall, collapsed } = applyDamageToCityHallOnHexTile(
    tile,
    rawDamage,
  );
  const synced = syncPrefeituraSlotStructureHpFromCityHall(afterHall);
  return {
    hexMap: {
      ...hexMap,
      hexes: {
        ...hexMap.hexes,
        [cityHallHexId]: synced,
      },
    },
    collapsed,
  };
}

/** @deprecated Use {@link applyDamageToCityHallStructure} with {@link CENTER_HEX_ID}. */
export function applyDamageToPrefeituraStructure(
  hexMap: HexMap,
  rawDamage: number,
): { hexMap: HexMap; collapsed: boolean } {
  return applyDamageToCityHallStructure(hexMap, CENTER_HEX_ID, rawDamage);
}

export function patchHexInMap(
  hexMap: HexMap,
  hexId: string,
  updater: (tile: HexTile) => HexTile,
): HexMap {
  const prev = hexMap.hexes[hexId];
  if (!prev) return hexMap;
  return {
    ...hexMap,
    hexes: {
      ...hexMap.hexes,
      [hexId]: updater(prev),
    },
  };
}

/** Set city hall structural HP and keep the Prefeitura slot in sync. */
export function setCityHallFeatureHp(
  hexMap: HexMap,
  cityHallHexId: string,
  currentHp: number,
  maxHp: number,
): HexMap {
  return patchHexInMap(hexMap, cityHallHexId, (tile) => {
    const max = Math.max(1, maxHp);
    const current = Math.min(max, Math.max(0, currentHp));
    const rest = (tile.features ?? []).filter((f) => f.type !== 'city_hall');
    const hall: HexTileCityHallFeature = {
      type: 'city_hall',
      currentHp: current,
      maxHp: max,
    };
    const withHall: HexTile = { ...tile, features: [...rest, hall] };
    return syncPrefeituraSlotStructureHpFromCityHall(withHall);
  });
}

/** Replace or insert wall pool HP (e.g. legacy save migration). */
export function upsertWallFeatureHp(
  tile: HexTile,
  currentHp: number,
  maxHp: number,
): HexTile {
  const rest = (tile.features ?? []).filter((f) => f.type !== 'wall');
  const wall: HexTileWallFeature = {
    type: 'wall',
    currentHp: Math.min(maxHp, Math.max(0, currentHp)),
    maxHp: Math.max(0, maxHp),
  };
  return { ...tile, features: [...rest, wall] };
}
