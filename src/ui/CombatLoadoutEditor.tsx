import { clampCombatSkillIds } from '../domain/characterNormalize.ts';
import { MAX_ALGO_RULES, MAX_COMBAT_SKILL_SLOTS } from '../domain/constants.ts';
import type { AlgoAction, AlgoCondition, AlgoRule } from '../domain/combat/ai/policy.ts';
import { conditionNeedsPercent } from '../domain/combat/ai/policy.ts';
import type { CombatPolicyMode } from '../domain/types/character.ts';
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
  combatRole: 'frontline' | 'ranged' | 'support';
  onChangeCombatRole: (next: 'frontline' | 'ranged' | 'support') => void;
  policyMode: CombatPolicyMode;
  algoRules: readonly AlgoRule[];
  onChangePolicyMode: (next: CombatPolicyMode) => void;
  onChangeAlgoRules: (next: AlgoRule[]) => void;
}

const CONDITION_OPTIONS: readonly { id: AlgoCondition['kind']; label: string }[] = [
  { id: 'foe_nearest', label: 'Inimigo mais próximo' },
  { id: 'foe_hp_at_most', label: 'Inimigo mais próximo com vida até' },
  { id: 'ally_hp_at_most', label: 'Aliado mais ferido com vida até' },
  { id: 'self_hp_at_most', label: 'Própria vida até' },
  { id: 'self', label: 'Si mesmo' },
];

function conditionFromKind(kind: AlgoCondition['kind'], percent: number): AlgoCondition {
  if (kind === 'foe_hp_at_most' || kind === 'ally_hp_at_most' || kind === 'self_hp_at_most') {
    return { kind, percent };
  }
  return { kind };
}

function percentOf(when: AlgoCondition): number {
  return 'percent' in when ? when.percent : 50;
}

function actionValue(action: AlgoAction): string {
  return action.kind === 'skill' ? `skill:${action.skillId}` : action.kind;
}

function actionFromValue(value: string): AlgoAction {
  if (value === 'retreat' || value === 'wait') return { kind: value };
  return { kind: 'skill', skillId: value.startsWith('skill:') ? value.slice(6) : value };
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
      cd: t?.cooldownSeconds,
      dur: t?.durationSeconds,
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
      <div className="combat-loadout-role">
        <h4 className="combat-loadout-subheading">Role</h4>
        <p className="game-muted">
          Define o posicionamento automático no início do combate (Slice 7).
        </p>
        <select
          value={props.combatRole}
          onChange={(e) =>
            props.onChangeCombatRole(
              e.target.value as 'frontline' | 'ranged' | 'support',
            )
          }
        >
          <option value="frontline">Frontline</option>
          <option value="ranged">Ranged</option>
          <option value="support">Support</option>
        </select>
      </div>
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
                          · CD {m.cd}s
                          {m.dur != null ? ` · ${m.dur}s duração` : ''}
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
                          · CD {m.cd}s
                          {m.dur != null ? ` · ${m.dur}s duração` : ''}
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
      <AlgoRuleEditor
        equipped={equipped}
        policyMode={props.policyMode}
        rules={props.algoRules}
        onChangePolicyMode={props.onChangePolicyMode}
        onChangeRules={props.onChangeAlgoRules}
        skillTitle={(id) => skillMeta(id).title}
      />
    </div>
  );
}

function AlgoRuleEditor(props: {
  equipped: readonly string[];
  policyMode: CombatPolicyMode;
  rules: readonly AlgoRule[];
  onChangePolicyMode: (next: CombatPolicyMode) => void;
  onChangeRules: (next: AlgoRule[]) => void;
  skillTitle: (id: string) => string;
}) {
  const rules = props.rules.slice(0, MAX_ALGO_RULES);

  function commit(next: AlgoRule[]) {
    props.onChangeRules(next.slice(0, MAX_ALGO_RULES));
  }

  function updateAt(index: number, rule: AlgoRule) {
    const next = rules.map((item, i) => (i === index ? rule : item));
    commit(next);
  }

  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= rules.length) return;
    const next = [...rules];
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(to, 0, row);
    commit(next);
  }

  function addRule() {
    if (rules.length >= MAX_ALGO_RULES) return;
    const skillId = props.equipped[0] ?? 'basic_attack';
    commit([
      ...rules,
      {
        enabled: true,
        when: { kind: 'foe_nearest' },
        do: { kind: 'skill', skillId },
      },
    ]);
  }

  return (
    <div className="combat-loadout-policy">
      <h4 className="combat-loadout-subheading">Política</h4>
      <p className="game-muted">
        Autoplay deixa o personagem decidir. AlgoCombat segue a lista de cima
        para baixo: a primeira regra válida ganha.
      </p>
      <select
        value={props.policyMode}
        onChange={(e) =>
          props.onChangePolicyMode(e.target.value as CombatPolicyMode)
        }
      >
        <option value="autoplay">Autoplay</option>
        <option value="algo">AlgoCombat</option>
      </select>
      {props.policyMode === 'algo' ? (
        <div className="combat-loadout-algo">
          {rules.length === 0 ? (
            <p className="game-muted">
              Sem regras, este personagem só espera a vez.
            </p>
          ) : (
            <ol className="combat-loadout-list combat-loadout-algo-list">
              {rules.map((rule, index) => {
                const percent = percentOf(rule.when);
                const knownSkill =
                  rule.do.kind !== 'skill' || props.equipped.includes(rule.do.skillId);
                return (
                  <li key={index}>
                    <div className="combat-loadout-algo-fields">
                      <label className="combat-loadout-algo-check">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) =>
                            updateAt(index, { ...rule, enabled: e.target.checked })
                          }
                        />
                        Ligada
                      </label>
                      <select
                        value={rule.when.kind}
                        onChange={(e) => {
                          const kind = e.target.value as AlgoCondition['kind'];
                          updateAt(index, {
                            ...rule,
                            when: conditionFromKind(kind, percent),
                          });
                        }}
                      >
                        {CONDITION_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {conditionNeedsPercent(rule.when.kind) ? (
                        <label className="combat-loadout-algo-percent">
                          <span className="game-muted">%</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={percent}
                            onChange={(e) => {
                              const next = Math.min(
                                100,
                                Math.max(1, Math.floor(Number(e.target.value) || 1)),
                              );
                              updateAt(index, {
                                ...rule,
                                when: conditionFromKind(rule.when.kind, next),
                              });
                            }}
                          />
                        </label>
                      ) : null}
                      <select
                        value={actionValue(rule.do)}
                        onChange={(e) =>
                          updateAt(index, {
                            ...rule,
                            do: actionFromValue(e.target.value),
                          })
                        }
                      >
                        <option value="retreat">Recuar</option>
                        <option value="wait">Esperar</option>
                        {props.equipped.map((id) => (
                          <option key={id} value={`skill:${id}`}>
                            {props.skillTitle(id)}
                          </option>
                        ))}
                        {!knownSkill && rule.do.kind === 'skill' ? (
                          <option value={`skill:${rule.do.skillId}`}>
                            {rule.do.skillId} (fora do loadout)
                          </option>
                        ) : null}
                      </select>
                    </div>
                    <div className="combat-loadout-algo-actions">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                        Subir
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === rules.length - 1}
                      >
                        Descer
                      </button>
                      <button
                        type="button"
                        onClick={() => commit(rules.filter((_, i) => i !== index))}
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <button type="button" onClick={addRule} disabled={rules.length >= MAX_ALGO_RULES}>
            Adicionar regra
          </button>
        </div>
      ) : null}
    </div>
  );
}
