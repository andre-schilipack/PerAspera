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

export function lineEnemyAttack(enemyLabel: string, damage: number): string {
  return `${enemyLabel} strikes back for ${damage} damage.`;
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
