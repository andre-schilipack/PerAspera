import { describe, expect, it } from 'vitest';
import {
  MOVE_CATALOG,
  MOVE_ID_GUARD_DISPARO,
  MOVE_ID_TOWER_RAJADA,
} from '../content/catalogs/moves.ts';
import {
  DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES,
  resolveDefenseNpcCatalogStrike,
  resolveGuardDisparoStrike,
  resolveTowerRajadaStrike,
} from './defenseNpcMoves.ts';

describe('defense NPC catalog moves', () => {
  it('registers Rajada and Disparo in catalog', () => {
    expect(MOVE_CATALOG[MOVE_ID_TOWER_RAJADA]?.name).toBe('Rajada');
    expect(MOVE_CATALOG[MOVE_ID_GUARD_DISPARO]?.name).toBe('Disparo');
    expect(MOVE_CATALOG[MOVE_ID_TOWER_RAJADA]?.tags).toContain('ranged');
    expect(MOVE_CATALOG[MOVE_ID_GUARD_DISPARO]?.tags).toContain('ranged');
  });

  it('hostile fire defender attrs keep legacy 0.10 dodge/block baseline', () => {
    expect(DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES.agility).toBe(0);
    expect(DEFENSE_HOSTILE_FIRE_DEFENDER_ATTRIBUTES.vitality).toBe(0);
  });

  it('resolveTowerRajadaStrike applies full damage when rng avoids dodge/block', () => {
    let i = 0;
    const seq = [0.99, 0.99];
    const rng = () => seq[i++] ?? 0.99;
    const r = resolveTowerRajadaStrike(12, rng);
    expect(r.flags.dodged).toBe(false);
    expect(r.flags.blocked).toBe(false);
    expect(r.finalDamage).toBe(12);
  });

  it('resolveGuardDisparoStrike dodges on first rng below dodge chance', () => {
    let i = 0;
    const rng = () => {
      const v = i === 0 ? 0.01 : 0.99;
      i += 1;
      return v;
    };
    const r = resolveGuardDisparoStrike(8, rng);
    expect(r.flags.dodged).toBe(true);
    expect(r.finalDamage).toBe(0);
  });

  it('resolveDefenseNpcCatalogStrike throws on unknown id', () => {
    expect(() =>
      resolveDefenseNpcCatalogStrike('nonexistent_move_xyz', 5, () => 0.5),
    ).toThrow('MOVE_CATALOG missing template');
  });
});
