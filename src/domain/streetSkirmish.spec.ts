import { describe, expect, it } from 'vitest';

import { DEFAULT_CORE_ATTRIBUTES } from './types/attributes.ts';
import {
  encounterChanceFromDanger,
  rollPatrolEncounter,
} from './patrolEncounter.ts';
import {
  runStreetSkirmish,
  speedFromAgility,
  STREET_TEAM_PLAYER,
} from './streetSkirmish.ts';
import { groupCanonicalEventsByTick } from './combat/io/groupByTick.ts';

describe('patrolEncounter', () => {
  it('scales chance with danger and respects the cap', () => {
    expect(encounterChanceFromDanger(0)).toBeCloseTo(0.06, 5);
    expect(encounterChanceFromDanger(100)).toBeCloseTo(0.4, 5);
    expect(encounterChanceFromDanger(100)).toBeLessThanOrEqual(0.42);
  });

  it('rollPatrolEncounter uses the provided random', () => {
    expect(rollPatrolEncounter({ danger: 50, random: () => 0 })).toBe(true);
    expect(rollPatrolEncounter({ danger: 50, random: () => 0.99 })).toBe(false);
  });
});

describe('streetSkirmish + combat engine', () => {
  it('maps agility to speed', () => {
    expect(speedFromAgility(1)).toBe(1);
    expect(speedFromAgility(5)).toBe(5);
    expect(speedFromAgility(0)).toBe(0.1);
  });

  it('resolves a 1v1 fight in one simulateBattle and exposes tick-grouped log', () => {
    const session = runStreetSkirmish({
      battleId: 'street-test-1',
      hexId: '0,1',
      danger: 40,
      characterId: 'hero-1',
      characterName: 'Ash',
      playerHealth: 42,
      playerMaxHealth: 42,
      coreAttributes: { ...DEFAULT_CORE_ATTRIBUTES, strength: 4, agility: 3 },
      skillIds: ['basic_attack'],
      combatRole: 'frontline',
      randomSource: () => 0.99,
      firstLogId: 1,
      nowMs: 1_700_000_000_000,
    });

    expect(['win', 'loss', 'draw']).toContain(session.outcome);
    expect(session.combatLog.length).toBeGreaterThan(1);
    expect(session.combatLog[0]!.text).toMatch(/Rust and eyes/);
    expect(session.battleResult.schemaVersion).toBe(1);

    const groups = groupCanonicalEventsByTick(session.battleResult.canonicalEvents);
    expect(groups.length).toBeGreaterThan(0);
    // Log turn field mirrors combat ticks for UI tabs.
    const turns = new Set(session.combatLog.map((e) => e.turn));
    expect(turns.has(0)).toBe(true);

    if (session.outcome === 'win') {
      expect(session.battleResult.finalState.winningTeamId).toBe(STREET_TEAM_PLAYER);
      expect(session.enemyHp).toBe(0);
    }
  });

  it('favored player usually wins a soft drone fight', () => {
    let wins = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const session = runStreetSkirmish({
        battleId: `street-fav-${String(i)}`,
        hexId: '1,0',
        danger: 12,
        characterId: 'hero-1',
        characterName: 'Ash',
        playerHealth: 42,
        playerMaxHealth: 42,
        coreAttributes: {
          ...DEFAULT_CORE_ATTRIBUTES,
          strength: 5,
          agility: 4,
          vitality: 3,
        },
        skillIds: ['basic_attack'],
        firstLogId: 1,
        randomSource: () => 0.85,
      });
      if (session.outcome === 'win') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(28);
  });
});
