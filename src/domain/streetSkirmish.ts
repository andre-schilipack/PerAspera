import {
  PLAYER_BASE_MAX_HP,
} from './constants.ts';
import { resolveIncomingMeleeDamage } from './combatResolution.ts';
import type { CombatLogEntry, EnemyInstance } from './types/combat.ts';
import type {
  StreetSkirmishOutcome,
  StreetSkirmishPhase,
  StreetSkirmishState,
} from './types/skirmish.ts';
import {
  lineEnemyAttack,
  lineEnemyAttackBlocked,
  lineEnemyAttackDodged,
  lineEnemyDefeated,
  linePlayerAttack,
  linePlayerAttackBlocked,
  linePlayerAttackDodged,
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
  /** From character.health; defaults to {@link PLAYER_BASE_MAX_HP}. */
  playerHealth?: number;
  playerMaxHealth?: number;
}

/**
 * Spawn one light enemy scaled slightly by district danger.
 */
export function createStreetSkirmish(
  params: CreateStreetSkirmishParams,
): StreetSkirmishState {
  const baseHp = 16 + Math.floor(params.danger / 12);
  const maxHp = params.playerMaxHealth ?? PLAYER_BASE_MAX_HP;
  const curHp = Math.min(
    maxHp,
    Math.max(1, params.playerHealth ?? maxHp),
  );
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
    playerHealth: curHp,
    playerMaxHealth: maxHp,
    combatLog: [],
    isCompleted: false,
    outcome: 'active',
    phase: 'preparing',
  };
}

export interface AdvanceStreetSkirmishResult {
  next: StreetSkirmishState;
  /** Assign ids sequentially starting at firstLogId when persisting. */
  newLogLines: Omit<CombatLogEntry, 'id'>[];
}

function defaultRng(): number {
  return Math.random();
}

/**
 * One exchange: you attack, then a surviving enemy hits back (if any).
 * Only runs meaningful simulation when `state.phase === 'fighting'`.
 */
export function advanceStreetSkirmishRound(
  state: StreetSkirmishState,
  rng: () => number = defaultRng,
): AdvanceStreetSkirmishResult {
  if (state.isCompleted || state.outcome !== 'active') {
    return { next: state, newLogLines: [] };
  }
  if (state.phase !== 'fighting') {
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
    const rawPlayer = 7 + Math.floor(rng() * 7);
    const label = enemyLabel(primary.enemyId);
    const resolved = resolveIncomingMeleeDamage(rawPlayer, rng);

    if (resolved.flags.dodged) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: linePlayerAttackDodged(state.characterName, label),
        type: 'player',
      });
    } else if (resolved.flags.blocked) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: linePlayerAttackBlocked(
          state.characterName,
          label,
          resolved.finalDamage,
        ),
        type: 'player',
      });
      const nh = primary.currentHealth - resolved.finalDamage;
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
    } else {
      newLogLines.push({
        turn,
        timestamp: now,
        text: linePlayerAttack(
          state.characterName,
          resolved.finalDamage,
          label,
        ),
        type: 'player',
      });
      const nh = primary.currentHealth - resolved.finalDamage;
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
  }

  let outcome: StreetSkirmishOutcome = state.outcome;
  let isCompleted = false;
  let phase: StreetSkirmishPhase = state.phase;

  if (enemies.length === 0) {
    outcome = 'win';
    isCompleted = true;
    phase = 'ended';
    newLogLines.push({
      turn,
      timestamp: now,
      text: lineSkirmishWin(),
      type: 'system',
    });
  } else if (enemies.length > 0) {
    const atk = enemies[0];
    const rawEnemy = 3 + Math.floor(state.danger / 22);
    const el = enemyLabel(atk.enemyId);
    const resolved = resolveIncomingMeleeDamage(rawEnemy, rng);

    if (resolved.flags.dodged) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineEnemyAttackDodged(el),
        type: 'enemy',
      });
    } else if (resolved.flags.blocked) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineEnemyAttackBlocked(el, resolved.finalDamage),
        type: 'enemy',
      });
      playerHealth = Math.max(0, playerHealth - resolved.finalDamage);
    } else {
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineEnemyAttack(el, resolved.finalDamage),
        type: 'enemy',
      });
      playerHealth = Math.max(0, playerHealth - resolved.finalDamage);
    }

    if (playerHealth <= 0) {
      outcome = 'loss';
      isCompleted = true;
      phase = 'ended';
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
    phase,
  };

  return { next, newLogLines };
}
