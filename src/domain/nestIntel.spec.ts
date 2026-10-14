import { describe, expect, it } from 'vitest';

import { NEST_RING_DISTANCE, OFFENSIVE_CONTRACT_CHAR_SLOTS } from './constants.ts';
import { axialDistance, parseHexKey } from './hex.ts';
import {
  applyNestDiscoveryToMap,
  nestDiscoveryChronicleText,
  nestHexIdDistanceFromOrigin,
  normalizeHexMapNestIntel,
  pickNestHexId,
  tileHasRobotNest,
} from './nestIntel.ts';
import type { HexMap, HexTile } from './types/map.ts';

function tileAt(q: number, r: number, unlocked: boolean): HexTile {
  return {
    id: `${q},${r}`,
    coordinates: { q, r },
    danger: 10,
    integrity: 90,
    placeSlots: [],
    isUnlocked: unlocked,
  };
}

function mapWith(
  hexes: Record<string, HexTile>,
  nest?: { nestHexId: string; discovered?: boolean },
): HexMap {
  return {
    size: 5,
    hexes,
    nestHexId: nest?.nestHexId,
    enemyNestDiscovered: nest?.discovered ?? false,
  };
}

describe('pickNestHexId', () => {
  it('always picks a hex at NEST_RING_DISTANCE from origin', () => {
    for (let i = 0; i < 24; i++) {
      const id = pickNestHexId(() => i / 24);
      expect(nestHexIdDistanceFromOrigin(id)).toBe(NEST_RING_DISTANCE);
      const c = parseHexKey(id);
      expect(c).not.toBeNull();
      expect(axialDistance(c!, { q: 0, r: 0 })).toBe(NEST_RING_DISTANCE);
    }
  });
});

describe('normalizeHexMapNestIntel', () => {
  it('fills missing nestHexId and defaults discovered to false', () => {
    const { hexMap, pendingDiscovery } = normalizeHexMapNestIntel(
      mapWith({ '0,0': tileAt(0, 0, true) }),
      () => 0,
    );
    expect(hexMap.nestHexId).toBeTruthy();
    expect(nestHexIdDistanceFromOrigin(hexMap.nestHexId!)).toBe(
      NEST_RING_DISTANCE,
    );
    expect(hexMap.enemyNestDiscovered).toBe(false);
    expect(pendingDiscovery).toBe(false);
  });

  it('sets pendingDiscovery when nest tile exists and is unlocked', () => {
    const nestId = pickNestHexId(() => 0);
    const c = parseHexKey(nestId)!;
    const { pendingDiscovery } = normalizeHexMapNestIntel(
      mapWith(
        { [nestId]: tileAt(c.q, c.r, true) },
        { nestHexId: nestId, discovered: false },
      ),
    );
    expect(pendingDiscovery).toBe(true);
  });
});

describe('applyNestDiscoveryToMap', () => {
  it('marks discovered, attaches robot_nest, and is idempotent', () => {
    const nestId = '3,0';
    const base = mapWith(
      { [nestId]: tileAt(3, 0, true) },
      { nestHexId: nestId, discovered: false },
    );
    const once = applyNestDiscoveryToMap(base);
    expect(once).not.toBeNull();
    expect(once!.enemyNestDiscovered).toBe(true);
    expect(tileHasRobotNest(once!.hexes[nestId]!)).toBe(true);
    expect(applyNestDiscoveryToMap(once!)).toBeNull();
  });

  it('returns null when nest hex is still locked', () => {
    const nestId = '3,0';
    const result = applyNestDiscoveryToMap(
      mapWith(
        { [nestId]: tileAt(3, 0, false) },
        { nestHexId: nestId, discovered: false },
      ),
    );
    expect(result).toBeNull();
  });

  it('returns null for non-matching missing nest id', () => {
    expect(
      applyNestDiscoveryToMap(
        mapWith({ '1,0': tileAt(1, 0, true) }, { nestHexId: '3,0' }),
      ),
    ).toBeNull();
  });
});

describe('nestDiscoveryChronicleText', () => {
  it('mentions nest hex and offensive', () => {
    const text = nestDiscoveryChronicleText('3,0');
    expect(text).toContain('3,0');
    expect(text.toLowerCase()).toContain('ninho');
    expect(OFFENSIVE_CONTRACT_CHAR_SLOTS).toBe(5);
  });
});
