import { applyOfflineHealthRegen } from '../domain/healthRegen.ts';
import { applyOfflineRegen } from '../domain/stamina.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';

/**
 * Advance passive STA/HP for all characters up to `targetMs` (inclusive).
 * Used by offline catch-up per simulated night; call again with `now` for tail regen.
 */
export function applyCharacterRegenUpTo(targetMs: number): void {
  const { characters, updateCharacter } = useCharactersStore.getState();
  for (const id of Object.keys(characters)) {
    const ch = characters[id]!;
    const sta = applyOfflineRegen({
      current: ch.stamina.current,
      max: ch.stamina.max,
      lastUpdated: ch.stamina.lastUpdated,
      now: targetMs,
    });
    const h = ch.health;
    const hp = applyOfflineHealthRegen({
      current: h.current,
      max: h.max,
      lastUpdated: h.lastUpdated,
      now: targetMs,
    });
    const patch: Parameters<typeof updateCharacter>[1] = {};
    if (sta.current !== ch.stamina.current || sta.lastUpdated !== ch.stamina.lastUpdated) {
      patch.stamina = { ...ch.stamina, current: sta.current, lastUpdated: sta.lastUpdated };
    }
    if (hp.current !== h.current || hp.lastUpdated !== h.lastUpdated) {
      patch.health = { ...h, current: hp.current, lastUpdated: hp.lastUpdated };
    }
    if (Object.keys(patch).length > 0) {
      updateCharacter(id, patch);
    }
  }
}
