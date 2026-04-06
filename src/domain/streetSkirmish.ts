import {
  STREET_SKIRMISH_PLAYER_HP,
} from './constants.ts';
import type { CombatLogEntry, EnemyInstance } from './types/combat.ts';
import type { StreetSkirmishOutcome, StreetSkirmishState } from './types/skirmish.ts';
import {
  lineEnemyAttack,
  lineEnemyDefeated,
  linePlayerAttack,
  lineRoundStart,
  lineSkirmishLoss,
  lineSkirmishWin,
} from '../content/skirmishLines.ts';

const STREET_DRONE_ID = 'street_drone';

function enemyLabel(enemyId: string): string {
  return enemyId === STREET_DRONE_ID ? 'a rust drone' : enemyId;
}

export interface CreateStreetSkirmishParams {
  hexId: string;
  danger: number;
  characterId: string;
  characterName: string;
}

/**
 * Spawn one light enemy scaled slightly by district danger.
 */
export function createStreetSkirmish(
  params: CreateStreetSkirmishParams,
): StreetSkirmishState {
  const baseHp = 16 + Math.floor(params.danger / 12);
  const enemies: EnemyInstance[] = [
    {
      enemyId: STREET_DRONE_ID,
      currentHealth: baseHp,
      buffs: {},
    },
  ];

  return {
    hexId: params.hexId,
    danger: params.danger,
    characterId: params.characterId,
    characterName: params.characterName,
    currentTurn: 0,
    enemies,
    playerHealth: STREET_SKIRMISH_PLAYER_HP,
    playerMaxHealth: STREET_SKIRMISH_PLAYER_HP,
    combatLog: [],
    isCompleted: false,
    outcome: 'active',
  };
}

export interface AdvanceStreetSkirmishResult {
  next: StreetSkirmishState;
  /** Assign ids sequentially starting at firstLogId when persisting. */
  newLogLines: Omit<CombatLogEntry, 'id'>[];
}

/**
 * One player action round: you attack, then a surviving enemy hits back.
 */
export function advanceStreetSkirmishRound(
  state: StreetSkirmishState,
): AdvanceStreetSkirmishResult {
  if (state.isCompleted || state.outcome !== 'active') {
    return { next: state, newLogLines: [] };
  }

  const turn = state.currentTurn + 1;
  const newLogLines: Omit<CombatLogEntry, 'id'>[] = [];
  const now = Date.now();

  newLogLines.push({
    turn,
    timestamp: now,
    text: lineRoundStart(turn),
    type: 'system',
  });

  let enemies = [...state.enemies];
  let playerHealth = state.playerHealth;

  const primary = enemies[0];
  if (primary) {
    const playerDamage = 7 + Math.floor(Math.random() * 7);
    const label = enemyLabel(primary.enemyId);
    newLogLines.push({
      turn,
      timestamp: now,
      text: linePlayerAttack(state.characterName, playerDamage, label),
      type: 'player',
    });

    const nh = primary.currentHealth - playerDamage;
    if (nh <= 0) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineEnemyDefeated(label),
        type: 'system',
      });
      enemies = enemies.slice(1);
    } else {
      enemies = [{ ...primary, currentHealth: nh }, ...enemies.slice(1)];
    }
  }

  let outcome: StreetSkirmishOutcome = state.outcome;
  let isCompleted = false;

  if (enemies.length === 0) {
    outcome = 'win';
    isCompleted = true;
    newLogLines.push({
      turn,
      timestamp: now,
      text: lineSkirmishWin(),
      type: 'system',
    });
  } else if (primary) {
    const enemyDamage = 3 + Math.floor(state.danger / 22);
    const label = enemyLabel(enemies[0].enemyId);
    newLogLines.push({
      turn,
      timestamp: now,
      text: lineEnemyAttack(label, enemyDamage),
      type: 'enemy',
    });
    playerHealth = Math.max(0, playerHealth - enemyDamage);
    if (playerHealth <= 0) {
      outcome = 'loss';
      isCompleted = true;
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineSkirmishLoss(),
        type: 'system',
      });
    }
  }

  const next: StreetSkirmishState = {
    ...state,
    currentTurn: turn,
    enemies,
    playerHealth,
    combatLog: [...state.combatLog],
    isCompleted,
    outcome,
  };

  return { next, newLogLines };
}
