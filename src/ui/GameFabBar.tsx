import type { GameNavItem, GameScreen } from './gameNavigation.ts';

export interface GameFabBarProps {
  activeScreen: GameScreen;
  onSelect: (screen: GameScreen) => void;
  /** Filtered by current hex — NPC screens only when standing on their tile. */
  items: readonly GameNavItem[];
}

/**
 * Mobile floating action bar with Lucide icons. Map & Profile show text labels.
 */
export function GameFabBar({ activeScreen, onSelect, items }: GameFabBarProps) {
  return (
    <div className="game-fab" role="toolbar" aria-label="Quick navigation">
      {items.map(({ id, label, Icon, fabShowLabel }) => (
        <button
          key={id}
          type="button"
          className={
            fabShowLabel
              ? 'game-fab-btn game-fab-btn--labeled'
              : 'game-fab-btn'
          }
          data-active={activeScreen === id}
          aria-label={label}
          aria-pressed={activeScreen === id}
          onClick={() => onSelect(id)}
        >
          <Icon
            className="game-fab-icon"
            size={fabShowLabel ? 18 : 22}
            strokeWidth={2}
            aria-hidden
          />
          {fabShowLabel ? (
            <span className="game-fab-label">{label}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
