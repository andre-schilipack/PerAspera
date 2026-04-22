import {
  PLAYER_BASE_MAX_HP,
} from './constants.ts';
import {
  combatBeatPhaseFromTurns,
  pickAutoplayMoveTemplate,
  resolveMoveTemplateStrike,
  resolveStrikeDamage,
} from './autobattle/index.ts';
import type { CombatBeatPhase } from './types/combat.ts';
import type {
  StreetSkirmishOutcome,
  StreetSkirmishPhase,
  StreetSkirmishState,
} from './types/skirmish.ts';
import {
  DEFAULT_CORE_ATTRIBUTES,
  type CoreAttributes,
} from './types/attributes.ts';
import type { CombatLogEntry, EnemyInstance } from './types/combat.ts';
import { DEFAULT_COMBAT_LOADOUT } from './characterNormalize.ts';
import { getMoveTemplate } from '../content/catalogs/moves.ts';
import { lineCombatBeatShift } from '../content/autobattleBeatLines.ts';
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

/** Rust drone uses baseline stats until enemy profiles exist. */
const STREET_DRONE_ATTRIBUTES: CoreAttributes = DEFAULT_CORE_ATTRIBUTES;

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
  /** From character.coreAttributes; defaults to all 1s. */
  coreAttributes?: CoreAttributes;
  /** From character.combatLoadout.skillIds; defaults to starter deck. */
  skillIds?: string[];
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
      maxHealth: baseHp,
      tacticalBucket: 'front',
      buffs: {},
    },
  ];

  const coreAttributes =
    params.coreAttributes ?? { ...DEFAULT_CORE_ATTRIBUTES };
  const skillIds =
    params.skillIds != null && params.skillIds.length > 0
      ? [...params.skillIds]
      : [...DEFAULT_COMBAT_LOADOUT.skillIds];

  return {
    hexId: params.hexId,
    danger: params.danger,
    characterId: params.characterId,
    characterName: params.characterName,
    coreAttributes,
    skillIds,
    lastCombatBeatPhase: null,
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

  let enemies = [...state.enemies];
  let playerHealth = state.playerHealth;

  const primary = enemies[0];
  let beatPhase: CombatBeatPhase = 'contact';
  let defenderHpFraction = 1;

  if (primary) {
    defenderHpFraction =
      primary.maxHealth > 0 ? primary.currentHealth / primary.maxHealth : 0;
    const attackerHpFraction =
      state.playerMaxHealth > 0
        ? playerHealth / state.playerMaxHealth
        : 0;
    beatPhase = combatBeatPhaseFromTurns({
      turn,
      attackerHpFraction,
      defenderHpFraction,
    });

    if (beatPhase !== state.lastCombatBeatPhase) {
      const shiftText = lineCombatBeatShift(beatPhase);
      if (shiftText.length > 0) {
        newLogLines.push({
          turn,
          timestamp: now,
          text: shiftText,
          type: 'system',
          combatBeatPhase: beatPhase,
        });
      }
    }
  }

  newLogLines.push({
    turn,
    timestamp: now,
    text: lineRoundStart(turn),
    type: 'system',
    combatBeatPhase: beatPhase,
  });

  if (primary) {
    const template = pickAutoplayMoveTemplate(
      state.skillIds,
      getMoveTemplate,
      state.coreAttributes,
      {
        combatBeatPhase: beatPhase,
        defenderHpFraction,
        rng,
      },
    );
    const label = enemyLabel(primary.enemyId);
    const resolved = resolveMoveTemplateStrike({
      template,
      attackerAttributes: state.coreAttributes,
      defenderReceivingStrike: STREET_DRONE_ATTRIBUTES,
      rng,
    });

    const highlightKill =
      resolved.finalDamage >= primary.currentHealth &&
      !resolved.flags.dodged;

    if (resolved.flags.dodged) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: linePlayerAttackDodged(state.characterName, label),
        type: 'player',
        combatBeatPhase: beatPhase,
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
        combatBeatPhase: beatPhase,
      });
      const nh = primary.currentHealth - resolved.finalDamage;
      if (nh <= 0) {
        newLogLines.push({
          turn,
          timestamp: now,
          text: lineEnemyDefeated(label),
          type: 'system',
          combatBeatPhase: beatPhase,
          highlight: highlightKill,
        });
        enemies = enemies.slice(1);
      } else {
        enemies = [
          {
            ...primary,
            currentHealth: nh,
            maxHealth: primary.maxHealth,
          },
          ...enemies.slice(1),
        ];
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
        combatBeatPhase: beatPhase,
      });
      const nh = primary.currentHealth - resolved.finalDamage;
      if (nh <= 0) {
        newLogLines.push({
          turn,
          timestamp: now,
          text: lineEnemyDefeated(label),
          type: 'system',
          combatBeatPhase: beatPhase,
          highlight: highlightKill,
        });
        enemies = enemies.slice(1);
      } else {
        enemies = [
          {
            ...primary,
            currentHealth: nh,
            maxHealth: primary.maxHealth,
          },
          ...enemies.slice(1),
        ];
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
      combatBeatPhase: beatPhase,
    });
  } else if (enemies.length > 0) {
    const atk = enemies[0];
    const rawEnemy = 3 + Math.floor(state.danger / 22);
    const el = enemyLabel(atk.enemyId);
    const resolvedEnemy = resolveStrikeDamage(
      rawEnemy,
      'physical',
      state.coreAttributes,
      rng,
    );

    if (resolvedEnemy.flags.dodged) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineEnemyAttackDodged(el),
        type: 'enemy',
        combatBeatPhase: beatPhase,
      });
    } else if (resolvedEnemy.flags.blocked) {
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineEnemyAttackBlocked(el, resolvedEnemy.finalDamage),
        type: 'enemy',
        combatBeatPhase: beatPhase,
      });
      playerHealth = Math.max(0, playerHealth - resolvedEnemy.finalDamage);
    } else {
      newLogLines.push({
        turn,
        timestamp: now,
        text: lineEnemyAttack(el, resolvedEnemy.finalDamage),
        type: 'enemy',
        combatBeatPhase: beatPhase,
      });
      playerHealth = Math.max(0, playerHealth - resolvedEnemy.finalDamage);
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
        combatBeatPhase: beatPhase,
      });
    }
  }

  const next: StreetSkirmishState = {
    ...state,
    currentTurn: turn,
    enemies,
    playerHealth,
    lastCombatBeatPhase: beatPhase,
    combatLog: [...state.combatLog],
    isCompleted,
    outcome,
    phase,
  };

  return { next, newLogLines };
}
