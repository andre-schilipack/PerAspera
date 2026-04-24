import { describe, expect, it } from 'vitest';

import {
  CENTER_HEX_ID,
  DEFAULT_HEX_WALL_MAX_HP,
  HOME_HEX_ID,
  NPC_OWNER_PREFEITURA,
} from '../domain/constants.ts';
import { createEmptyDailyDefense } from '../domain/factories/createDefenseSeed.ts';
import { sumLivingThreatPoints } from '../domain/enemyThreat.ts';
import type { DailyDefenseState } from '../domain/types/defense.ts';
import type { HexMap } from '../domain/types/map.ts';

import { buildNightlyDefenseAdvanceCommit } from './nightlyDefenseAdvance.ts';

function hexMapWithWallAt(hexId: string, currentHp: number, maxHp: number): HexMap {
  return {
    size: 2,
    hexes: {
      [hexId]: {
        id: hexId,
        coordinates: { q: 1, r: 0 },
        danger: 0,
        integrity: 50,
        placeSlots: [],
        isUnlocked: true,
        features: [{ type: 'wall', currentHp, maxHp }],
      },
    },
  };
}

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
        features: [
          {
            type: 'city_hall',
            currentHp: hp.current,
            maxHp: hp.max,
          },
        ],
      },
    },
  };
}

function activeFighting(
  over: Partial<DailyDefenseState> = {},
): DailyDefenseState {
  const d = createEmptyDailyDefense({ date: '2026-08-10' });
  return {
    ...d,
    phase: 'fighting',
    outcome: 'active',
    isCompleted: false,
    ...over,
  };
}

describe('nightly defense advance regression (game layer)', () => {
  it('aborts prefeitura siege when city map is missing', () => {
    const base = createEmptyDailyDefense({ date: '2026-08-10' });
    const daily: DailyDefenseState = {
      ...base,
      phase: 'fighting',
      outcome: 'prefeitura_siege',
      isCompleted: false,
      currentTurn: 0,
    };
    const now = 1_800_000_000_000;
    const c = buildNightlyDefenseAdvanceCommit(
      {
        dailyDefense: daily,
        nextCombatLogEntryId: 7,
        civilianPopulation: 200,
        hexMap: null,
      },
      () => 0.5,
      now,
    );
    expect(c.declareGameOver).toEqual({ reason: 'prefeitura_fallen', at: now });
    expect(c.dailyDefense.phase).toBe('ended');
    expect(c.nextCombatLogEntryId).toBeGreaterThan(7);
  });

  it('updates combat log and ids during an active perimeter round', () => {
    const enemies = [
      {
        enemyId: 'g',
        currentHealth: 25,
        maxHealth: 25,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const dd = activeFighting({
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [
        {
          characterId: 'p1',
          name: 'Pilot',
          currentHp: 30,
          maxHp: 30,
          retreated: false,
          tacticalBucket: 'front',
        },
      ],
      combatLog: [],
    });
    const startLogLen = dd.combatLog.length;
    const hexMap = hexMapWithWallAt(
      dd.targetHexId,
      DEFAULT_HEX_WALL_MAX_HP,
      DEFAULT_HEX_WALL_MAX_HP,
    );
    const c = buildNightlyDefenseAdvanceCommit(
      {
        dailyDefense: dd,
        nextCombatLogEntryId: 20,
        civilianPopulation: 400,
        hexMap,
      },
      () => 0.42,
      1_750_000_000_000,
    );
    expect(c.dailyDefense.combatLog.length).toBeGreaterThan(startLogLen);
    expect(c.nextCombatLogEntryId).toBeGreaterThan(20);
    expect(c.declareGameOver).toBeUndefined();
  });

  it('wall breach with hex map opens Prefeitura siege when hostiles remain after raid', () => {
    const enemies = [
      {
        enemyId: 'ram',
        currentHealth: 300,
        maxHealth: 300,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const dd = activeFighting({
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [],
      combatLog: [],
    });
    const hexMap = hexMapWithWallAt(dd.targetHexId, 4, 400);
    const c = buildNightlyDefenseAdvanceCommit(
      {
        dailyDefense: dd,
        nextCombatLogEntryId: 1,
        civilianPopulation: 120,
        hexMap,
      },
      () => 0.96,
      1_760_000_000_000,
    );
    expect(c.dailyDefense.outcome).toBe('prefeitura_siege');
    expect(c.dailyDefense.phase).toBe('fighting');
    expect(c.breachRaid).not.toBe('skipped');
  });

  it('runs one siege round when hex map exists', () => {
    const enemies = [
      {
        enemyId: 's',
        currentHealth: 120,
        maxHealth: 120,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const dd: DailyDefenseState = {
      ...createEmptyDailyDefense({ date: '2026-08-11' }),
      phase: 'fighting',
      outcome: 'prefeitura_siege',
      isCompleted: false,
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [
        {
          characterId: 'd',
          name: 'Def',
          currentHp: 22,
          maxHp: 22,
          retreated: false,
          tacticalBucket: 'front',
        },
      ],
      combatLog: [],
    };
    const hexMap = mapWithPrefeitura({ current: 400, max: 400 });
    const startLen = dd.combatLog.length;
    const c = buildNightlyDefenseAdvanceCommit(
      {
        dailyDefense: dd,
        nextCombatLogEntryId: 50,
        civilianPopulation: 600,
        hexMap,
      },
      () => 0.51,
      1_765_000_000_000,
    );
    expect(c.dailyDefense.combatLog.length).toBeGreaterThan(startLen);
    expect(c.updatedHexMap).toBeDefined();
    expect(c.declareGameOver).toBeUndefined();
  });
});
