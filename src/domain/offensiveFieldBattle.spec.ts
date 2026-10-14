import { describe, expect, it } from 'vitest';

import { NEST_STRUCTURE_MAX_HP } from './constants.ts';
import { upsertRobotNestFeatureHp } from './nestIntel.ts';
import { resolveOffensiveNestBattle } from './offensiveFieldBattle.ts';
import type { HexMap, HexTile } from './types/map.ts';

function nestMap(nestId: string, nestHp: number): HexMap {
  const tile: HexTile = upsertRobotNestFeatureHp(
    {
      id: nestId,
      coordinates: { q: 3, r: 0 },
      danger: 40,
      integrity: 50,
      placeSlots: [],
      isUnlocked: true,
    },
    nestHp,
    NEST_STRUCTURE_MAX_HP,
  );
  return {
    size: 7,
    hexes: { [nestId]: tile },
    nestHexId: nestId,
    enemyNestDiscovered: true,
  };
}

function attackers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    characterId: `char_${String(i + 1)}`,
    name: `Hero ${String(i + 1)}`,
    currentHp: 80,
    maxHp: 80,
  }));
}

describe('resolveOffensiveNestBattle', () => {
  it('victory when nest falls; reduces city threat; rebuilds nest HP', () => {
    const nestId = '3,0';
    // Tiny nest HP so attackers reliably crack it.
    const result = resolveOffensiveNestBattle({
      battleId: 'off-win',
      hexMap: nestMap(nestId, 8),
      nestHexId: nestId,
      attackers: attackers(5),
      cityThreatLevel: 4,
      rng: () => 0.99,
      nowMs: 1,
    });
    expect(result.outcome).toBe('victory');
    expect(result.nestHpLost).toBeGreaterThan(0);
    expect(result.threatReduced).toBeGreaterThan(0);
    expect(result.cityThreatAfter).toBeLessThan(result.cityThreatBefore);
    const nest = result.hexMap.hexes[nestId]?.features?.find(
      (f) => f.type === 'robot_nest',
    );
    expect(nest && nest.type === 'robot_nest' ? nest.currentHp : 0).toBe(
      NEST_STRUCTURE_MAX_HP,
    );
  });

  it('interrupted when every attacker retreats with nest still up', () => {
    const nestId = '3,0';
    const result = resolveOffensiveNestBattle({
      battleId: 'off-retreat',
      hexMap: nestMap(nestId, NEST_STRUCTURE_MAX_HP),
      nestHexId: nestId,
      attackers: attackers(5).map((a) => ({ ...a, currentHp: 5, maxHp: 100 })),
      cityThreatLevel: 3,
      // Always in retreat zone + always pass retreat roll (rng < chance).
      rng: () => 0,
      nowMs: 1,
    });
    expect(result.outcome).toBe('interrupted');
    expect(result.attackers.every((a) => a.retreated || a.currentHp <= 0)).toBe(
      true,
    );
    const nest = result.hexMap.hexes[nestId]?.features?.find(
      (f) => f.type === 'robot_nest',
    );
    expect(nest && nest.type === 'robot_nest' ? nest.currentHp : 0).toBeGreaterThan(
      0,
    );
  });
});
