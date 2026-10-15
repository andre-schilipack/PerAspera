import { describe, expect, it } from 'vitest';

import { playback } from './combat/io/playback.ts';
import {
  EXPANSION_CAPTAIN_UNIT_ID,
  EXPANSION_CLEAR_BASE_DRONES,
  EXPANSION_GUARD_UNIT_IDS,
} from './constants.ts';
import {
  expansionDroneCount,
  resolveExpansionClearBattle,
} from './expansionClearBattle.ts';

function fighters() {
  return [
    {
      characterId: 'char_a',
      name: 'Ana',
      currentHp: 40,
      maxHp: 40,
    },
    {
      characterId: 'char_b',
      name: 'Bia',
      currentHp: 40,
      maxHp: 40,
    },
  ];
}

describe('resolveExpansionClearBattle', () => {
  it('fields the captain, two guards, and 4+N drones without touching a map', () => {
    const distance = 2;
    const result = resolveExpansionClearBattle({
      battleId: 'clear-count',
      distanceFromCenter: distance,
      fighters: fighters(),
      rng: () => 0,
      nowMs: 1,
    });

    const spawned = result.battleResult.canonicalEvents.filter(
      (event) => event.type === 'unit_spawned',
    );
    const ids = spawned.map((event) =>
      event.type === 'unit_spawned' ? event.unitId : '',
    );
    expect(expansionDroneCount(distance)).toBe(EXPANSION_CLEAR_BASE_DRONES + distance);
    expect(ids.filter((id) => id.startsWith('expansion_drone:'))).toHaveLength(
      EXPANSION_CLEAR_BASE_DRONES + distance,
    );
    expect(ids).toContain(EXPANSION_CAPTAIN_UNIT_ID);
    expect(ids).toContain(EXPANSION_GUARD_UNIT_IDS[0]);
    expect(ids).toContain(EXPANSION_GUARD_UNIT_IDS[1]);
    expect(ids).toContain('char_a');
    expect(ids).toContain('char_b');
    expect(result).not.toHaveProperty('hexMap');

    const pb = playback(result.battleResult.canonicalEvents);
    expect(pb.finalState).toEqual(result.battleResult.finalState);
  });

  it('drops a fighter who is already at 0 HP', () => {
    const result = resolveExpansionClearBattle({
      battleId: 'clear-down',
      distanceFromCenter: 0,
      fighters: [
        { ...fighters()[0]!, currentHp: 0 },
        fighters()[1]!,
      ],
      rng: () => 0,
      nowMs: 1,
    });
    const ids = result.battleResult.canonicalEvents
      .filter((event) => event.type === 'unit_spawned')
      .map((event) => (event.type === 'unit_spawned' ? event.unitId : ''));
    expect(ids).not.toContain('char_a');
    expect(ids).toContain('char_b');
    expect(ids.filter((id) => id.startsWith('expansion_drone:'))).toHaveLength(4);
  });
});
