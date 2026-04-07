import { applyOfflineRegen } from '../domain/stamina.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';

/**
 * Applies passive STA regen to every character (same rules as load / offline).
 * Safe to call on an interval while the app is open.
 */
export function applyStaminaRegenToAllCharacters(now: number): void {
  const { characters, updateCharacter } = useCharactersStore.getState();
  for (const id of Object.keys(characters)) {
    const ch = characters[id];
    const { current, lastUpdated } = applyOfflineRegen({
      current: ch.stamina.current,
      max: ch.stamina.max,
      lastUpdated: ch.stamina.lastUpdated,
      now,
    });
    if (
      current !== ch.stamina.current ||
      lastUpdated !== ch.stamina.lastUpdated
    ) {
      updateCharacter(id, {
        stamina: { ...ch.stamina, current, lastUpdated },
      });
    }
  }
}
