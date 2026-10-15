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

const { BATTLE_ARCHIVE_CAP } = await import('../domain/constants.ts');
const { playback } = await import('../domain/combat/io/playback.ts');
const { resolveExpansionClearBattle } = await import(
  '../domain/expansionClearBattle.ts'
);
const { useBattleArchiveStore } = await import('./useBattleArchiveStore.ts');

import type { BattleKind, BattleReel } from '../domain/types/battleArchive.ts';

describe('useBattleArchiveStore', () => {
  beforeEach(() => {
    memory.clear();
    useBattleArchiveStore.setState({ nextId: 0, entries: [] });
  });

  it('stores canonical events for each battle kind and playback matches finalState', () => {
    const resolved = resolveExpansionClearBattle({
      battleId: 'archive-src',
      distanceFromCenter: 1,
      fighters: [
        { characterId: 'char_a', name: 'Ana', currentHp: 30, maxHp: 30 },
      ],
      rng: () => 0,
      nowMs: 1,
    });
    const kinds: BattleKind[] = ['expansion', 'street', 'nightly', 'offensive'];
    for (const kind of kinds) {
      const reel: BattleReel = {
        kind,
        at: 1,
        title: kind,
        outcome: resolved.outcome,
        participantCharacterIds: ['char_a'],
        unitNames: resolved.unitNames,
        battleResult: resolved.battleResult,
      };
      useBattleArchiveStore.getState().append(reel);
    }
    const entries = useBattleArchiveStore.getState().entries;
    expect(entries.map((entry) => entry.kind)).toEqual(kinds);
    for (const entry of entries) {
      const pb = playback(entry.battleResult.canonicalEvents);
      expect(pb.finalState).toEqual(entry.battleResult.finalState);
    }
    const id = entries[0]!.id;
    useBattleArchiveStore.getState().markSeen(id, 'char_a');
    expect(
      useBattleArchiveStore.getState().entries[0]?.seenByCharacterIds,
    ).toEqual(['char_a']);
    expect(
      useBattleArchiveStore.getState().entries[1]?.seenByCharacterIds,
    ).toEqual([]);
  });

  it('drops entries older than the cap', () => {
    const resolved = resolveExpansionClearBattle({
      battleId: 'archive-cap',
      distanceFromCenter: 0,
      fighters: [
        { characterId: 'char_a', name: 'Ana', currentHp: 20, maxHp: 20 },
      ],
      rng: () => 0,
      nowMs: 1,
    });
    for (let i = 0; i < BATTLE_ARCHIVE_CAP + 3; i += 1) {
      useBattleArchiveStore.getState().append({
        kind: 'street',
        at: i,
        title: `Rua ${String(i)}`,
        outcome: 'win',
        participantCharacterIds: ['char_a'],
        unitNames: resolved.unitNames,
        battleResult: resolved.battleResult,
      });
    }
    const entries = useBattleArchiveStore.getState().entries;
    expect(entries).toHaveLength(BATTLE_ARCHIVE_CAP);
    expect(entries[0]?.title).toBe(`Rua ${String(3)}`);
    expect(entries[entries.length - 1]?.title).toBe(
      `Rua ${String(BATTLE_ARCHIVE_CAP + 2)}`,
    );
  });
});