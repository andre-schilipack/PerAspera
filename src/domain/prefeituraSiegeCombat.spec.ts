import { describe, expect, it } from 'vitest';

import {
  CENTER_HEX_ID,
  NPC_OWNER_PREFEITURA,
} from './constants.ts';
import { createEmptyDailyDefense, createInitialWallState } from './factories/createDefenseSeed.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import { advancePrefeituraSiegeRound } from './prefeituraSiegeCombat.ts';
import type { DailyDefenseState } from './types/defense.ts';
import type { HexMap } from './types/map.ts';

function mapWithPrefeitura(hp: { current: number; max: number }): HexMap {
  return {
    size: 3,
    hexes: {
      [CENTER_HEX_ID]: {
        id: CENTER_HEX_ID,
        coordinates: { q: 0, r: 0 },
        isUnlocked: true,
        danger: 0,
        integrity: 50,
        placeSlots: [
          {
            id: 'slot_pref',
            hexId: CENTER_HEX_ID,
            ownedBy: NPC_OWNER_PREFEITURA,
            type: 'prefeitura',
            priceToBuy: 0,
            structureHp: hp,
          },
        ],
      },
    },
  };
}

function baseSiegeDaily(over: Partial<DailyDefenseState> = {}): DailyDefenseState {
  const d = createEmptyDailyDefense({ date: '2026-04-01' });
  const enemies = over.enemies ?? [
    { enemyId: 'stalker_1', currentHealth: 500, buffs: {} },
  ];
  return {
    ...d,
    outcome: 'prefeitura_siege',
    phase: 'fighting',
    isCompleted: false,
    enemies,
    defenderLine: over.defenderLine ?? [],
    totalEnemyPoints: sumLivingThreatPoints(enemies),
    ...over,
  };
}

describe('advancePrefeituraSiegeRound', () => {
  it('ends in loss when Prefeitura structural HP is exhausted', () => {
    const wall = createInitialWallState();
    const daily = baseSiegeDaily();
    const hexMap = mapWithPrefeitura({ current: 4, max: 100 });
    // High rolls: max tower / guard / strike damage; one enemy survives to hit the building.
    const r = advancePrefeituraSiegeRound(daily, wall, hexMap, () => 0.9999);
    expect(r.fightEnded).toBe(true);
    expect(r.nextDaily.outcome).toBe('loss');
    const pref = r.hexMap.hexes[CENTER_HEX_ID]!.placeSlots[0]!;
    expect(pref.structureHp?.current).toBe(0);
  });

  it('clears retreat so previously fallen-back defenders fight at the Prefeitura', () => {
    const wall = createInitialWallState();
    const daily = baseSiegeDaily({
      defenderLine: [
        {
          characterId: 'c1',
          name: 'Hero',
          currentHp: 30,
          maxHp: 42,
          retreated: true,
        },
      ],
    });
    const hexMap = mapWithPrefeitura({ current: 100, max: 100 });
    const r = advancePrefeituraSiegeRound(daily, wall, hexMap, () => 0.5);
    expect(r.nextDaily.defenderLine[0]!.retreated).toBe(false);
    expect(
      r.newLogLines.some(
        (l) => l.type === 'player' && l.text.includes('Hero'),
      ),
    ).toBe(true);
  });

  it('declares victory when the siege wave is already empty', () => {
    const wall = createInitialWallState();
    const daily = baseSiegeDaily({ enemies: [], totalEnemyPoints: 0 });
    const hexMap = mapWithPrefeitura({ current: 100, max: 100 });
    const r = advancePrefeituraSiegeRound(daily, wall, hexMap, Math.random);
    expect(r.fightEnded).toBe(true);
    expect(r.nextDaily.outcome).toBe('victory');
  });
});
