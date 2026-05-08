import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from '../../types/attributes.ts';
import { simulateBattle } from './simulate.ts';

describe('combat engine slice 5 movement', () => {
  it('never moves two units into the same tile (occupancy)', () => {
    const res = simulateBattle({
      battleId: 'occ-1',
      maxTicks: 5,
      randomSource: () => 0.9,
      units: [
        { unitId: 'A1', teamId: 'A', role: 'frontline', tileId: '0,0', attributes: DEFAULT_CORE_ATTRIBUTES, maxHp: 20, maxMana: 0, speed: 10 },
        { unitId: 'A2', teamId: 'A', role: 'frontline', tileId: '0,2', attributes: DEFAULT_CORE_ATTRIBUTES, maxHp: 20, maxMana: 0, speed: 10 },
        { unitId: 'B1', teamId: 'B', role: 'frontline', tileId: '0,4', attributes: DEFAULT_CORE_ATTRIBUTES, maxHp: 200, maxMana: 0, speed: 1 },
      ],
    });

    // Reconstruct occupancy over time from events.
    const pos: Record<string, string> = {};
    for (const e of res.canonicalEvents) {
      if (e.type === 'unit_spawned') pos[e.unitId] = e.tileId;
      if (e.type === 'unit_moved') pos[e.unitId] = e.toTileId;
      const livingPositions = Object.values(pos);
      const unique = new Set(livingPositions);
      expect(unique.size).toBe(livingPositions.length);
    }
  });

  it('does not immediately oscillate back to the previous tile', () => {
    const res = simulateBattle({
      battleId: 'osc-1',
      maxTicks: 10,
      randomSource: () => 0.9,
      units: [
        { unitId: 'A1', teamId: 'A', role: 'frontline', tileId: '0,0', attributes: DEFAULT_CORE_ATTRIBUTES, maxHp: 20, maxMana: 0, speed: 10 },
        { unitId: 'B1', teamId: 'B', role: 'frontline', tileId: '0,3', attributes: DEFAULT_CORE_ATTRIBUTES, maxHp: 200, maxMana: 0, speed: 1 },
      ],
    });

    const moves = res.canonicalEvents
      .filter((e) => e.type === 'unit_moved' && e.unitId === 'A1')
      .map((e) => ({ from: e.fromTileId, to: e.toTileId }));

    for (let i = 1; i < moves.length; i++) {
      const prev = moves[i - 1]!;
      const cur = moves[i]!;
      // No A->B immediately followed by B->A.
      expect(!(prev.from === cur.to && prev.to === cur.from)).toBe(true);
    }
  });
});

