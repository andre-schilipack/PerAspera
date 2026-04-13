/**
 * Street skirmish log templates (player-facing English; tune for Robusto voice).
 */

export function linePlayerAttack(
  characterName: string,
  damage: number,
  enemyLabel: string,
): string {
  return `${characterName} hits ${enemyLabel} for ${damage} damage.`;
}

export function linePlayerAttackDodged(
  characterName: string,
  enemyLabel: string,
): string {
  return `${enemyLabel} dodges ${characterName}'s strike.`;
}

export function linePlayerAttackBlocked(
  characterName: string,
  enemyLabel: string,
  damage: number,
): string {
  return `${enemyLabel} blocks ${characterName}'s swing — ${damage} damage gets through.`;
}

export function lineEnemyAttack(enemyLabel: string, damage: number): string {
  return `${enemyLabel} strikes back for ${damage} damage.`;
}

export function lineEnemyAttackDodged(enemyLabel: string): string {
  return `You dodge ${enemyLabel}'s lunge.`;
}

export function lineEnemyAttackBlocked(enemyLabel: string, damage: number): string {
  return `You block ${enemyLabel}'s swing — ${damage} damage gets through.`;
}

export function lineEnemyDefeated(enemyLabel: string): string {
  return `${enemyLabel} goes dark in the rust.`;
}

export function lineSkirmishWin(): string {
  return 'The block is clear — you scrape a win off the pavement.';
}

export function lineSkirmishLoss(): string {
  return 'You black out — wake up lighter and angrier.';
}

export function lineRoundStart(turn: number): string {
  return `— Round ${String(turn)} —`;
}
