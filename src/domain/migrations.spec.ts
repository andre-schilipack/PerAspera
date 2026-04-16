import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from './constants.ts';
import { migrateGameMetaState } from './migrations.ts';

describe('migrateGameMetaState', () => {
  it('adds game over and hall of fame defaults when upgrading from older schema', () => {
    const raw = {
      version: '0.1.0',
      schemaVersion: 2,
      createdAt: 1,
      globalScoreboard: [],
      nextIds: {
        character: 1,
        combatLogEntry: 0,
        business: 0,
        placeSlot: 3,
        contract: 0,
      },
    };
    const m = migrateGameMetaState(raw);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.hallOfFame).toEqual([]);
    expect(m.gameOver).toBe(false);
    expect(m.gameOverReason).toBeNull();
    expect(m.gameOverAt).toBeNull();
  });

  it('preserves game over when present', () => {
    const raw = {
      version: '0.1.0',
      schemaVersion: 3,
      createdAt: 1,
      globalScoreboard: [],
      nextIds: {
        character: 1,
        combatLogEntry: 0,
        business: 0,
        placeSlot: 3,
        contract: 0,
      },
      gameOver: true,
      gameOverReason: 'prefeitura_fallen',
      gameOverAt: 99,
    };
    const m = migrateGameMetaState(raw);
    expect(m.hallOfFame).toEqual([]);
    expect(m.gameOver).toBe(true);
    expect(m.gameOverReason).toBe('prefeitura_fallen');
    expect(m.gameOverAt).toBe(99);
  });

  it('preserves hall of fame when present on schema 4', () => {
    const raw = {
      version: '0.1.0',
      schemaVersion: 4,
      createdAt: 1,
      globalScoreboard: [],
      hallOfFame: [
        {
          fameList: [
            {
              characterId: 'char_1',
              name: 'A',
              score: 10,
              updatedAt: 1,
            },
          ],
          gameOverDateTime: 1000,
          daysSurvived: 3,
          reason: 'prefeitura_fallen',
        },
      ],
      nextIds: {
        character: 1,
        combatLogEntry: 0,
        business: 0,
        placeSlot: 3,
        contract: 0,
      },
    };
    const m = migrateGameMetaState(raw);
    expect(m.hallOfFame).toHaveLength(1);
    expect(m.hallOfFame[0]?.daysSurvived).toBe(3);
    expect(m.hallOfFame[0]?.fameList[0]?.name).toBe('A');
  });
});
