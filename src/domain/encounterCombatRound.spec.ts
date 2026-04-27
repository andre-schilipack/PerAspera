import { describe, expect, it } from 'vitest';

import { DEFAULT_HEX_WALL_MAX_HP, HOME_HEX_ID } from './constants.ts';
import { createEmptyDailyDefense } from './factories/createDefenseSeed.ts';
import { sumLivingThreatPoints } from './enemyThreat.ts';
import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import type { HexMap } from './types/map.ts';
import {
  defenderLineForPrefeituraSiege,
  massDefenseSkillPickContext,
  normalizeMassDefenseDefenderLine,
  runEncounterCombatRound,
} from './encounterCombatRound.ts';

function hexMapWithWallAt(hexId: string): HexMap {
  return {
    size: 1,
    hexes: {
      [hexId]: {
        id: hexId,
        coordinates: { q: 0, r: 0 },
        danger: 0,
        integrity: 50,
        placeSlots: [],
        isUnlocked: true,
        features: [
          {
            type: 'wall',
            currentHp: DEFAULT_HEX_WALL_MAX_HP,
            maxHp: DEFAULT_HEX_WALL_MAX_HP,
          },
        ],
      },
    },
  };
}

describe('encounterCombatRound', () => {
  it('normalizeMassDefenseDefenderLine fills tactical buckets', () => {
    const line = normalizeMassDefenseDefenderLine([
      {
        characterId: 'a',
        name: 'A',
        currentHp: 10,
        maxHp: 10,
        retreated: false,
      },
    ]);
    expect(line[0]!.tacticalBucket).toBe('front');
  });

  it('defenderLineForPrefeituraSiege clears retreat for living defenders', () => {
    const line = defenderLineForPrefeituraSiege([
      {
        characterId: 'a',
        name: 'A',
        currentHp: 10,
        maxHp: 10,
        retreated: true,
        tacticalBucket: 'front',
      },
    ]);
    expect(line[0]!.retreated).toBe(false);
  });

  it('runEncounterCombatRound nightly_wall increments turn and appends lines', () => {
    const base = createEmptyDailyDefense({ date: '2026-06-01' });
    const enemies = [
      {
        enemyId: 'grunt',
        currentHealth: 40,
        maxHealth: 40,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const daily = {
      ...base,
      phase: 'fighting' as const,
      outcome: 'active' as const,
      isCompleted: false,
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [],
    };

    const hexMap = hexMapWithWallAt(HOME_HEX_ID);

    const r = runEncounterCombatRound({
      alliedStructures: [{ type: 'wall', hexId: HOME_HEX_ID }],
      enemies: daily.enemies,
      hexMap,
      rng: () => 0.55,
      defenderLine: [],
      continuation: {
        currentTurn: daily.currentTurn,
        outcome: daily.outcome,
        phase: daily.phase,
        allySpirit: daily.allySpirit,
        moraleShockTurnsRemaining: daily.moraleShockTurnsRemaining,
        wallHexFallback: daily.targetHexId,
      },
    });

    expect(r.stateDelta.currentTurn).toBe(1);
    expect(r.newLogLines.some((l) => l.text.includes('Nightly defense'))).toBe(
      true,
    );
    expect(r.wallResult.hexMap).toBeDefined();
  });

  it('massDefenseSkillPickContext uses endgame beat when hostiles are low', () => {
    const ctx = massDefenseSkillPickContext(
      2,
      false,
      [
        {
          enemyId: 'x',
          currentHealth: 2,
          maxHealth: 100,
          tacticalBucket: 'front',
          buffs: {},
        },
      ],
      [
        {
          characterId: 'c',
          name: 'Hero',
          currentHp: 40,
          maxHp: 40,
          retreated: false,
          tacticalBucket: 'front',
        },
      ],
      () => 0.5,
    );
    expect(ctx.combatBeatPhase).toBe('endgame');
    expect(ctx.defenderHpFraction).toBeLessThan(0.05);
  });

  it('defender autoplay logs catalog move name when skillIds present', () => {
    const base = createEmptyDailyDefense({ date: '2026-06-02' });
    const enemies = [
      {
        enemyId: 'grunt',
        currentHealth: 80,
        maxHealth: 80,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];
    const daily = {
      ...base,
      phase: 'fighting' as const,
      outcome: 'active' as const,
      isCompleted: false,
      enemies,
      totalEnemyPoints: sumLivingThreatPoints(enemies),
      defenderLine: [],
    };

    const hexMap = hexMapWithWallAt(HOME_HEX_ID);

    const r = runEncounterCombatRound({
      alliedStructures: [{ type: 'wall', hexId: HOME_HEX_ID }],
      enemies: daily.enemies,
      hexMap,
      rng: () => 0.55,
      defenderLine: normalizeMassDefenseDefenderLine([
        {
          characterId: 'c1',
          name: 'Vega',
          currentHp: 30,
          maxHp: 30,
          retreated: false,
          tacticalBucket: 'front',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES },
          skillIds: ['basic_attack'],
        },
      ]),
      continuation: {
        currentTurn: daily.currentTurn,
        outcome: daily.outcome,
        phase: daily.phase,
        allySpirit: daily.allySpirit,
        moraleShockTurnsRemaining: daily.moraleShockTurnsRemaining,
        wallHexFallback: daily.targetHexId,
      },
    });

    const playerLines = r.newLogLines.filter((l) => l.type === 'player');
    expect(playerLines.some((l) => l.text.includes('Basic attack'))).toBe(
      true,
    );
  });

  it('keeps defender move cooldowns across rounds and falls back while cooling down', () => {
    const hexMap = hexMapWithWallAt(HOME_HEX_ID);
    const enemies = [
      {
        enemyId: 'grunt_a',
        currentHealth: 1000,
        maxHealth: 1000,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
      {
        enemyId: 'grunt_b',
        currentHealth: 1000,
        maxHealth: 1000,
        tacticalBucket: 'front' as const,
        buffs: {},
      },
    ];

    const first = runEncounterCombatRound({
      alliedStructures: [],
      enemies,
      hexMap,
      rng: () => 0.99,
      defenderLine: normalizeMassDefenseDefenderLine([
        {
          characterId: 'c1',
          name: 'Vega',
          currentHp: 200,
          maxHp: 200,
          retreated: false,
          tacticalBucket: 'ranged',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 8 },
          skillIds: ['fireball', 'basic_attack'],
          combatState: { cooldowns: {}, statuses: {} },
        },
      ]),
      continuation: {
        currentTurn: 0,
        outcome: 'active',
        phase: 'fighting',
      },
    });

    expect(first.newLogLines.some((l) => l.text.includes('Bola de fogo'))).toBe(
      true,
    );
    expect(first.stateDelta.defenderLine[0]!.combatState?.cooldowns.fireball).toBe(5);

    const second = runEncounterCombatRound({
      alliedStructures: [],
      enemies: first.stateDelta.enemies,
      hexMap,
      rng: () => 0.99,
      defenderLine: first.stateDelta.defenderLine,
      continuation: {
        currentTurn: first.stateDelta.currentTurn,
        outcome: first.stateDelta.outcome,
        phase: first.stateDelta.phase,
        allySpirit: first.stateDelta.allySpirit,
        moraleShockTurnsRemaining: first.stateDelta.moraleShockTurnsRemaining,
      },
    });

    const playerLines = second.newLogLines.filter((l) => l.type === 'player');
    expect(playerLines.some((l) => l.text.includes('Basic attack'))).toBe(true);
    expect(playerLines.some((l) => l.text.includes('Bola de fogo'))).toBe(false);
    expect(second.stateDelta.defenderLine[0]!.combatState?.cooldowns.fireball).toBe(4);
  });

  it('respects multi and all target scopes in player move logs', () => {
    const hexMap = hexMapWithWallAt(HOME_HEX_ID);
    const enemies = Array.from({ length: 3 }, (_, i) => ({
      enemyId: `grunt_${String(i)}`,
      currentHealth: 1000,
      maxHealth: 1000,
      tacticalBucket: 'front' as const,
      buffs: {},
    }));

    const multi = runEncounterCombatRound({
      alliedStructures: [],
      enemies,
      hexMap,
      rng: () => 0.99,
      defenderLine: normalizeMassDefenseDefenderLine([
        {
          characterId: 'c1',
          name: 'Vega',
          currentHp: 200,
          maxHp: 200,
          retreated: false,
          tacticalBucket: 'ranged',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 8 },
          skillIds: ['fireball'],
          combatState: { cooldowns: {}, statuses: {} },
        },
      ]),
      continuation: { currentTurn: 0, outcome: 'active', phase: 'fighting' },
    });
    expect(multi.newLogLines.some((l) => l.text.includes('2 targets'))).toBe(true);

    const all = runEncounterCombatRound({
      alliedStructures: [],
      enemies,
      hexMap,
      rng: () => 0.99,
      defenderLine: normalizeMassDefenseDefenderLine([
        {
          characterId: 'c1',
          name: 'Vega',
          currentHp: 200,
          maxHp: 200,
          retreated: false,
          tacticalBucket: 'ranged',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 8 },
          skillIds: ['arc_burst'],
          combatState: { cooldowns: {}, statuses: {} },
        },
      ]),
      continuation: { currentTurn: 0, outcome: 'active', phase: 'fighting' },
    });
    expect(all.newLogLines.some((l) => l.text.includes('3 targets'))).toBe(true);
  });

  it('cure heals the most wounded living ally without exceeding max HP', () => {
    const hexMap = hexMapWithWallAt(HOME_HEX_ID);
    const r = runEncounterCombatRound({
      alliedStructures: [],
      enemies: [
        {
          enemyId: 'brute',
          currentHealth: 1000,
          maxHealth: 1000,
          tacticalBucket: 'front',
          buffs: {},
        },
      ],
      hexMap,
      rng: () => 0.99,
      defenderLine: normalizeMassDefenseDefenderLine([
        {
          characterId: 'healer',
          name: 'Nara',
          currentHp: 100,
          maxHp: 100,
          retreated: false,
          tacticalBucket: 'front',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES, intelligence: 3, charisma: 3 },
          skillIds: ['cure'],
          combatState: { cooldowns: {}, statuses: {} },
        },
        {
          characterId: 'ally',
          name: 'Ivo',
          currentHp: 5,
          maxHp: 20,
          retreated: false,
          tacticalBucket: 'ranged',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES },
          skillIds: ['basic_attack'],
          combatState: { cooldowns: {}, statuses: {} },
        },
      ]),
      continuation: { currentTurn: 0, outcome: 'active', phase: 'fighting' },
    });

    expect(r.stateDelta.defenderLine[1]!.currentHp).toBe(19);
    expect(r.newLogLines.some((l) => l.text.includes('heals Ivo'))).toBe(true);
  });

  it('defensive stance raises block chance while the status is active', () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      if (calls === 18) return 0.99;
      if (calls === 19) return 0.3;
      return 0.5;
    };

    const r = runEncounterCombatRound({
      alliedStructures: [],
      enemies: [
        {
          enemyId: 'brute',
          currentHealth: 1000,
          maxHealth: 1000,
          tacticalBucket: 'front',
          buffs: {},
        },
      ],
      hexMap: hexMapWithWallAt(HOME_HEX_ID),
      rng,
      defenderLine: normalizeMassDefenseDefenderLine([
        {
          characterId: 'tank',
          name: 'Bia',
          currentHp: 40,
          maxHp: 40,
          retreated: false,
          tacticalBucket: 'front',
          coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES },
          skillIds: ['defensive_stance'],
          combatState: { cooldowns: {}, statuses: {} },
        },
      ]),
      continuation: { currentTurn: 0, outcome: 'active', phase: 'fighting' },
    });

    expect(r.stateDelta.defenderLine[0]!.combatState?.statuses.defensive_stance).toBe(3);
    expect(r.stateDelta.defenderLine[0]!.currentHp).toBe(37);
  });
});
