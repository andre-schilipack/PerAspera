import { describe, expect, it } from 'vitest';

import { ALLY_SPIRIT_INITIAL, HOME_HEX_ID } from '../domain/constants.ts';
import type { WallState } from '../domain/types/defense.ts';
import { defenseEndScreenFromCommit } from './defenseEndScreenFromCommit.ts';
import type { NightlyDefenseAdvanceCommit } from './nightlyDefenseAdvance.ts';

const wall: WallState = {
  level: 1,
  layers: 1,
  sections: {
    north: { current: 100, max: 100, breached: false },
    south: { current: 100, max: 100, breached: false },
    east: { current: 100, max: 100, breached: false },
    west: { current: 100, max: 100, breached: false },
  },
};

describe('defenseEndScreenFromCommit', () => {
  it('returns defeat for breach', () => {
    const commit: NightlyDefenseAdvanceCommit = {
      wall,
      nextCombatLogEntryId: 1,
      dailyDefense: {
        date: '2026-01-01',
        currentTurn: 1,
        isLocked: {},
        lockedAt: {},
        enlistedForDate: {},
        combatLog: [],
        enemies: [],
        totalEnemyPoints: 0,
        playerContribution: {},
        isCompleted: true,
        startHour: 20,
        attackedSection: 'north',
        participants: [],
        gameDayIndex: 0,
        targetHexId: HOME_HEX_ID,
        phase: 'ended',
        outcome: 'breach',
        defenderLine: [],
        allySpirit: ALLY_SPIRIT_INITIAL,
        moraleShockTurnsRemaining: 0,
        victoryLootPool: [],
      },
    };
    const end = defenseEndScreenFromCommit(commit, (id) => id);
    expect(end).toEqual({ kind: 'defeat', variant: 'breach' });
  });

  it('returns victory with merged rewards and loot', () => {
    const commit: NightlyDefenseAdvanceCommit = {
      wall,
      nextCombatLogEntryId: 2,
      dailyDefense: {
        date: '2026-01-01',
        currentTurn: 1,
        isLocked: {},
        lockedAt: {},
        enlistedForDate: {},
        combatLog: [],
        enemies: [],
        totalEnemyPoints: 0,
        playerContribution: {},
        isCompleted: true,
        startHour: 20,
        attackedSection: 'north',
        participants: [],
        gameDayIndex: 0,
        targetHexId: HOME_HEX_ID,
        phase: 'ended',
        outcome: 'victory',
        defenderLine: [
          {
            characterId: 'c1',
            name: 'A',
            currentHp: 10,
            maxHp: 20,
            retreated: false,
            tacticalBucket: 'front',
          },
        ],
        allySpirit: ALLY_SPIRIT_INITIAL,
        moraleShockTurnsRemaining: 0,
        victoryLootPool: [],
      },
      victoryRewards: [
        {
          characterId: 'c1',
          scoreDelta: 10,
          reputationDelta: 5,
          credsDelta: 3,
        },
      ],
      victoryLootGrants: [
        {
          characterId: 'c1',
          items: [
            {
              id: 'loot1',
              name: 'Scrap Metal',
              type: 'material',
              rarity: 'common',
              value: 8,
              effects: {},
              quantity: 2,
            },
          ],
        },
      ],
    };
    const end = defenseEndScreenFromCommit(commit, () => 'Hero');
    expect(end?.kind).toBe('victory');
    if (end?.kind === 'victory') {
      expect(end.participants).toHaveLength(1);
      expect(end.participants[0]!.name).toBe('Hero');
      expect(end.participants[0]!.items).toHaveLength(1);
      expect(end.participants[0]!.items[0]!.quantity).toBe(2);
    }
  });
});
