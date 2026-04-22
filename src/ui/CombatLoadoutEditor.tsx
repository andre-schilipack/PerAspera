import { clampCombatSkillIds } from '../domain/characterNormalize.ts';
import { MAX_COMBAT_SKILL_SLOTS } from '../domain/constants.ts';
import type { MoveTemplateId } from '../domain/types/combat.ts';
import {
  getMoveTemplate,
  MOVE_CATALOG,
  PLAYER_COMBAT_SKILL_POOL,
} from '../content/catalogs/moves.ts';

function poolSortedByName(): readonly MoveTemplateId[] {
  return [...PLAYER_COMBAT_SKILL_POOL].sort((a, b) => {
    const na = MOVE_CATALOG[a]?.name ?? a;
    const nb = MOVE_CATALOG[b]?.name ?? b;
    return na.localeCompare(nb);
  });
}

export interface CombatLoadoutEditorProps {
  skillIds: readonly string[];
  onChangeSkillIds: (next: string[]) => void;
}

export function CombatLoadoutEditor(props: CombatLoadoutEditorProps) {
  const equipped = clampCombatSkillIds(props.skillIds);
  const pool = poolSortedByName();
  const canAddMore = equipped.length < MAX_COMBAT_SKILL_SLOTS;

  function setEquipped(next: string[]) {
    props.onChangeSkillIds(clampCombatSkillIds(next));
  }

  function removeAt(index: number) {
    const copy = [...equipped];
    copy.splice(index, 1);
    setEquipped(copy);
  }

  function addSkill(id: MoveTemplateId) {
    if (!canAddMore || equipped.includes(id)) return;
    setEquipped([...equipped, id]);
  }

  function skillMeta(id: string) {
    const t = getMoveTemplate(id as MoveTemplateId);
    return {
      title: t?.name ?? id,
      subtitle: t?.description ?? '',
      cd: t?.cooldownTurns,
      dur: t?.durationTurns,
    };
  }

  const unused = pool.filter((id) => !equipped.includes(id));

  return (
    <div className="combat-loadout-editor">
      <h3>Loadout de combate</h3>
      <p className="game-muted">
        Até {MAX_COMBAT_SKILL_SLOTS} habilidades. O motor de combate ainda usa
        dano unificado; efeitos de buff/cura completos chegam nas próximas
        iterações.
      </p>
      <div className="combat-loadout-columns">
        <div>
          <h4 className="combat-loadout-subheading">Equipadas</h4>
          {equipped.length === 0 ? (
            <p className="game-muted">
              Nenhuma — o autoplay usa Basic attack como padrão.
            </p>
          ) : (
            <ul className="combat-loadout-list">
              {equipped.map((id, index) => {
                const m = skillMeta(id);
                return (
                  <li key={`${id}-${index}`}>
                    <div>
                      <strong>{m.title}</strong>
                      <span className="game-muted combat-loadout-id">
                        {' '}
                        ({id})
                      </span>
                      {m.cd != null ? (
                        <span className="game-muted">
                          {' '}
                          · CD {m.cd}t
                          {m.dur != null ? ` · ${m.dur}t duração` : ''}
                        </span>
                      ) : null}
                      <div className="game-muted combat-loadout-desc">
                        {m.subtitle}
                      </div>
                    </div>
                    <button type="button" onClick={() => removeAt(index)}>
                      Remover
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <h4 className="combat-loadout-subheading">Disponíveis</h4>
          {!canAddMore ? (
            <p className="game-muted">Slots cheios — remova uma habilidade.</p>
          ) : unused.length === 0 ? (
            <p className="game-muted">Todas já estão no loadout.</p>
          ) : (
            <ul className="combat-loadout-list">
              {unused.map((id) => {
                const m = skillMeta(id);
                return (
                  <li key={id}>
                    <div>
                      <strong>{m.title}</strong>
                      <span className="game-muted combat-loadout-id">
                        {' '}
                        ({id})
                      </span>
                      {m.cd != null ? (
                        <span className="game-muted">
                          {' '}
                          · CD {m.cd}t
                          {m.dur != null ? ` · ${m.dur}t duração` : ''}
                        </span>
                      ) : null}
                      <div className="game-muted combat-loadout-desc">
                        {m.subtitle}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addSkill(id)}
                      disabled={!canAddMore}
                    >
                      Adicionar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
