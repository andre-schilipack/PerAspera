import type { GameFabActionItem, GameScreen } from './gameNavigation.ts';

export interface GameFabBarProps {
  activeScreen: GameScreen;
  onSelect: (screen: GameScreen) => void;
  /** Filtered by current hex — NPC actions only when standing on their tile. */
  items: readonly GameFabActionItem[];
}

/**
 * Bottom action bar (always visible): Market, Defense, Lots, Scores — icon-only.
 */
export function GameFabBar({ activeScreen, onSelect, items }: GameFabBarProps) {
  return (
    <div className="game-fab" role="toolbar" aria-label="Character actions">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="game-fab-btn"
          data-active={activeScreen === id}
          aria-label={label}
          aria-pressed={activeScreen === id}
          onClick={() => onSelect(id)}
        >
          <Icon
            className="game-fab-icon"
            size={22}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}
