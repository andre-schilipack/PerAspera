import { applyOfflineHealthRegen } from '../domain/healthRegen.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';

/**
 * Applies passive HP regen to every character (same rules as load / offline).
 * Call on the same interval as stamina regen while the app is open.
 */
export function applyHealthRegenToAllCharacters(now: number): void {
  const { characters, updateCharacter } = useCharactersStore.getState();
  for (const id of Object.keys(characters)) {
    const ch = characters[id];
    const h = ch.health;
    const { current, lastUpdated } = applyOfflineHealthRegen({
      current: h.current,
      max: h.max,
      lastUpdated: h.lastUpdated,
      now,
    });
    if (current !== h.current || lastUpdated !== h.lastUpdated) {
      updateCharacter(id, {
        health: { ...h, current, lastUpdated },
      });
    }
  }
}
