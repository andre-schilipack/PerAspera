import { beforeEach, describe, expect, it } from 'vitest';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => {
      memory.clear();
    },
    key: (_index: number) => null as string | null,
    get length() {
      return memory.size;
    },
  } satisfies Storage,
});

const { OFFENSIVE_CONTRACT_CHAR_SLOTS } = await import('../domain/constants.ts');
const { pickNestHexId } = await import('../domain/nestIntel.ts');
const { useCityStore } = await import('../stores/useCityStore.ts');
const { useContractsStore } = await import('../stores/useContractsStore.ts');
const { useMetaStore } = await import('../stores/useMetaStore.ts');
const { useWorldStore } = await import('../stores/useWorldStore.ts');
const {
  ensureOffensiveContract,
  findOpenOffensiveContract,
  maybeDiscoverNestAfterUnlock,
  normalizeWorldNestIntel,
} = await import('./nestDiscovery.ts');

import type { HexMap, HexTile } from '../domain/types/map.ts';

function unlockedTile(id: string, q: number, r: number): HexTile {
  return {
    id,
    coordinates: { q, r },
    danger: 20,
    integrity: 80,
    placeSlots: [],
    isUnlocked: true,
  };
}

function resetStores(): void {
  memory.clear();
  useWorldStore.setState({ hexMap: null });
  useContractsStore.setState({ contracts: {} });
  useCityStore.setState({ chronicle: [] });
  useMetaStore.setState({
    nextIds: {
      character: 0,
      combatLogEntry: 0,
      business: 0,
      placeSlot: 0,
      contract: 0,
    },
  });
}

describe('nestDiscovery game helpers', () => {
  beforeEach(() => {
    resetStores();
  });

  it('posts one offensive with 5 char slots and is idempotent', () => {
    const nestId = pickNestHexId(() => 0);
    const a = ensureOffensiveContract(nestId);
    const b = ensureOffensiveContract(nestId);
    expect(a.id).toBe(b.id);
    expect(a.type).toBe('offensive');
    expect(a.charSlots).toBe(OFFENSIVE_CONTRACT_CHAR_SLOTS);
    expect(a.targetHexId).toBe(nestId);
    expect(
      findOpenOffensiveContract(useContractsStore.getState().contracts)?.id,
    ).toBe(a.id);
  });

  it('discovers nest once: feature, chronicle, offensive', () => {
    const nestId = '3,0';
    const hexMap: HexMap = {
      size: 7,
      hexes: { [nestId]: unlockedTile(nestId, 3, 0) },
      nestHexId: nestId,
      enemyNestDiscovered: false,
    };
    useWorldStore.setState({ hexMap });

    const first = maybeDiscoverNestAfterUnlock(hexMap, nestId, 1_000);
    expect(first.discovered).toBe(true);
    if (!first.discovered) return;

    const map = useWorldStore.getState().hexMap!;
    expect(map.enemyNestDiscovered).toBe(true);
    expect(
      map.hexes[nestId]?.features?.some((f) => f.type === 'robot_nest'),
    ).toBe(true);
    expect(useCityStore.getState().chronicle).toHaveLength(1);
    expect(useCityStore.getState().chronicle[0]?.text).toContain(nestId);
    expect(first.contract.charSlots).toBe(5);

    const second = maybeDiscoverNestAfterUnlock(
      useWorldStore.getState().hexMap!,
      nestId,
      2_000,
    );
    expect(second.discovered).toBe(false);
    expect(useCityStore.getState().chronicle).toHaveLength(1);
  });

  it('does not discover when unlocking a non-nest hex', () => {
    const nestId = '3,0';
    const other = '2,0';
    const hexMap: HexMap = {
      size: 7,
      hexes: {
        [nestId]: {
          ...unlockedTile(nestId, 3, 0),
          isUnlocked: false,
        },
        [other]: unlockedTile(other, 2, 0),
      },
      nestHexId: nestId,
      enemyNestDiscovered: false,
    };
    useWorldStore.setState({ hexMap });
    const r = maybeDiscoverNestAfterUnlock(hexMap, other);
    expect(r.discovered).toBe(false);
    expect(useContractsStore.getState().contracts).toEqual({});
  });

  it('normalizeWorldNestIntel fires pending discovery for old saves', () => {
    const nestId = pickNestHexId(() => 0.2);
    const [q, r] = nestId.split(',').map(Number) as [number, number];
    useWorldStore.setState({
      hexMap: {
        size: 7,
        hexes: { [nestId]: unlockedTile(nestId, q, r) },
        nestHexId: nestId,
        enemyNestDiscovered: false,
      },
    });
    normalizeWorldNestIntel(() => 0);
    expect(useWorldStore.getState().hexMap?.enemyNestDiscovered).toBe(true);
    expect(
      findOpenOffensiveContract(useContractsStore.getState().contracts),
    ).not.toBeNull();
  });
});
