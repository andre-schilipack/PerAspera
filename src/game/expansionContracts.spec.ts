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
    key: () => null as string | null,
    get length() {
      return memory.size;
    },
  } satisfies Storage,
});

const { CENTER_HEX_ID } = await import('../domain/constants.ts');
const { playback } = await import('../domain/combat/io/playback.ts');
const { createCharacter } = await import('../domain/factories/createCharacter.ts');
const { useBattleArchiveStore } = await import('../stores/useBattleArchiveStore.ts');
const { useCharactersStore } = await import('../stores/useCharactersStore.ts');
const { useContractsStore } = await import('../stores/useContractsStore.ts');
const { useExpansionStore } = await import('../stores/useExpansionStore.ts');
const { useMetaStore } = await import('../stores/useMetaStore.ts');
const { useWorldStore } = await import('../stores/useWorldStore.ts');
const {
  commitExpansionClear,
  enlistInExpansionContract,
} = await import('./expansionContracts.ts');

import type { HexMap, HexTile } from '../domain/types/map.ts';

function tile(id: string, q: number, r: number, isUnlocked: boolean): HexTile {
  return {
    id,
    coordinates: { q, r },
    danger: 20,
    integrity: 80,
    placeSlots: [],
    isUnlocked,
  };
}

function resetStores(): void {
  memory.clear();
  useWorldStore.setState({
    hexMap: {
      size: 5,
      hexes: {
        '0,0': tile('0,0', 0, 0, true),
        '2,0': tile('2,0', 2, 0, false),
      },
    } satisfies HexMap,
  });
  useContractsStore.setState({
    contracts: {
      contract_1: {
        id: 'contract_1',
        type: 'expansion',
        ownerId: 'npc:quartel_general',
        targetHexId: '2,0',
        charSlots: 2,
        enlistedCharacterIds: ['char_a', 'char_b'],
        staminaCost: 20,
        status: 'open',
        createdAt: 1,
      },
    },
  });
  useCharactersStore.setState({
    currentCharacterId: 'char_a',
    characters: {
      char_a: createCharacter({
        id: 'char_a',
        name: 'Ana',
        homeHexId: '1,0',
        currentHexId: '1,0',
        nowMs: 1,
      }),
      char_b: createCharacter({
        id: 'char_b',
        name: 'Bia',
        homeHexId: '1,0',
        currentHexId: '1,-1',
        nowMs: 1,
      }),
    },
  });
  useMetaStore.setState({
    nextIds: {
      character: 2,
      combatLogEntry: 0,
      business: 0,
      placeSlot: 0,
      contract: 1,
    },
  });
  useBattleArchiveStore.setState({ nextId: 0, entries: [] });
  useExpansionStore.setState({ session: null });
}

describe('commitExpansionClear', () => {
  beforeEach(() => {
    resetStores();
  });

  it('unlocks the target hex on victory and leaves characters where they are', () => {
    const result = commitExpansionClear({
      contractId: 'contract_1',
      outcome: 'victory',
      nowMs: 50,
      fighters: [
        { characterId: 'char_a', currentHp: 12, maxHp: 40, retreated: false },
        { characterId: 'char_b', currentHp: 3, maxHp: 40, retreated: true },
      ],
    });
    expect(result.nestDiscovered).toBe(false);
    expect(useWorldStore.getState().hexMap?.hexes['2,0']?.isUnlocked).toBe(true);
    expect(useContractsStore.getState().contracts.contract_1?.status).toBe(
      'completed',
    );
    const ana = useCharactersStore.getState().characters.char_a;
    const bia = useCharactersStore.getState().characters.char_b;
    expect(ana?.health.current).toBe(12);
    expect(ana?.currentHexId).toBe('1,0');
    expect(bia?.health.current).toBe(3);
    expect(bia?.currentHexId).toBe('1,-1');
  });

  it('keeps the hex locked and reopens enlistment on defeat', () => {
    commitExpansionClear({
      contractId: 'contract_1',
      outcome: 'defeat',
      nowMs: 50,
      fighters: [
        { characterId: 'char_a', currentHp: 4, maxHp: 40, retreated: false },
        { characterId: 'char_b', currentHp: 0, maxHp: 40, retreated: true },
      ],
    });
    expect(useWorldStore.getState().hexMap?.hexes['2,0']?.isUnlocked).toBe(false);
    const contract = useContractsStore.getState().contracts.contract_1;
    expect(contract?.status).toBe('open');
    expect(contract?.enlistedCharacterIds).toEqual([]);
    expect(useCharactersStore.getState().characters.char_a?.currentHexId).toBe(
      CENTER_HEX_ID,
    );
    expect(useCharactersStore.getState().characters.char_b?.currentHexId).toBe(
      CENTER_HEX_ID,
    );
    expect(useCharactersStore.getState().characters.char_a?.health.current).toBe(4);
  });
});

describe('enlistInExpansionContract', () => {
  beforeEach(() => {
    resetStores();
    useContractsStore.setState({
      contracts: {
        contract_1: {
          id: 'contract_1',
          type: 'expansion',
          ownerId: 'npc:quartel_general',
          targetHexId: '2,0',
          charSlots: 2,
          enlistedCharacterIds: ['char_a'],
          staminaCost: 20,
          status: 'open',
          createdAt: 1,
        },
      },
    });
  });

  it('starts a clear when the second volunteer enlists and archives the reel', () => {
    const result = enlistInExpansionContract('contract_1', 'char_b', 80, () => 0);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.completed) {
      throw new Error('expected the clear to launch');
    }
    const entry = useBattleArchiveStore.getState().entries[0];
    expect(entry?.kind).toBe('expansion');
    expect(entry?.participantCharacterIds).toEqual(['char_a', 'char_b']);
    expect(entry?.seenByCharacterIds).toEqual(['char_b']);
    expect(entry?.battleResult.canonicalEvents.length).toBeGreaterThan(0);
    const pb = playback(entry!.battleResult.canonicalEvents);
    expect(pb.finalState).toEqual(entry!.battleResult.finalState);
    expect(useExpansionStore.getState().session?.targetHexId).toBe('2,0');
    const contract = useContractsStore.getState().contracts.contract_1;
    if (result.outcome === 'victory') {
      expect(useWorldStore.getState().hexMap?.hexes['2,0']?.isUnlocked).toBe(true);
      expect(contract?.status).toBe('completed');
    } else {
      expect(useWorldStore.getState().hexMap?.hexes['2,0']?.isUnlocked).toBe(false);
      expect(contract?.status).toBe('open');
      expect(contract?.enlistedCharacterIds).toEqual([]);
    }
  });
});
