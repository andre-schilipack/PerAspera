# Classes and skill tree

**Status:** First-pass design. The skill list is a suggestion to refine. Not an implementation spec.  
**Date:** 2026-10-03

Durable loop constraints live in `docs/act1-player-loop.md` and `.cursor/rules/peraspera-vision.mdc`. User-facing names below are Portuguese.

## Decisions

- Every character starts as **Aspirante**.
- From a set level, the character seeks a profession. The level, and where they seek it, are still open.
- Act 1 first professions (**1-1**, the first job only) are **Guerreiro**, **Comerciante**, and **Cientista**.
- There is no multiclass and no reset. Another build is another character. Aspirante skills remain on the sheet after the job change.
- Second job (2-1 / 2-2) waits. A character who survives an Act 1 victory is locked for Act 2; that is the natural home for the next job.
- Experience grants skill points. A point raises the level of a skill that Aspirante or the current profession provides.
- Attack and movement are basic actions. They are not skills and do not spend points.
- Each skill has levels. The effect grows with the skill level.

## What each class is

**Aspirante.** Does not want to fight. Stays in the fight as an observer, or as a weak fighter.

**Guerreiro.** Likes a melee weapon, and can also equip ranged weapons (rifles, crossbows, and the like). Takes a beating and closes wounds relatively fast. Kills. Dangerous.

**Comerciante.** The advantage sits in the macro game. Financial efficacy channels money into combat efficacy, so the character shows up well equipped. Prefers ranged. Some go to the front anyway. Commercial skills, plus some combat skills.

**Cientista.** The mage of this cyber world. Early combat skills are unimpressive: high cooldown or high mana. Late game, mages are legendary. Economically, this is the character focused on creating tech and skills. Spends a long time studying and developing. That study is the main way this class gains experience.

## Suggested rules

These sit around the decisions above. Numbers are not locked.

- Experience leans on the life of the class. Aspirante gains a little from manual labor and from watching the fight. Guerreiro gains it from kills at night. Comerciante gains it from the volume the household sells and pays. Cientista gains it from studying.
- How many skill points a character level grants belongs to the level-up pass, still unspecified.
- After the job change, new points can still go into Aspirante skills. Those skills stay weak, so the spend is usually a poor trade.
- Combat actives go in the loadout. The current cap is 6 slots (`MAX_COMBAT_SKILL_SLOTS`). Passives are always on. City skills do not use a combat slot.
- Placement (`combatRole`: frontline, ranged, support) stays a choice. The class shows up through skills and gear.
- Guerreiro melee skills require a melee weapon in hand. Guerreiro ranged skills require a rifle, crossbow, or similar. The autobattle policy uses what the equipped weapon allows.
- On Cientista combat skills, each point raises power and lowers mana or cooldown. Rank 1 is embarrassing. A high rank decides the night. Attack and movement stay on the sheet, so early on this character mostly strikes and, now and then, casts Centelha.
- Power, mana, cooldown, and economic percentages are a later tuning pass.

## Suggested skills

First pass. Refine in place.

### Aspirante

The kit does not kill. The character witnesses the fight.

| Skill | Kind | Role |
| --- | --- | --- |
| Observar | passive, combat | In an observer seat, the fight grants a thread of experience. The body barely enters contact. |
| Grito de alerta | active, combat | Marks an enemy. The next ally who hits that target hits a little harder. |
| Recuar | active, combat | One step away. The policy uses it when HP drops. |
| Esquiva atrapalhada | active, buff | Short evasion, high cooldown. |
| Fôlego curto | passive, combat | Very low HP regeneration. |
| Mão na massa | active, city | The only economic work. Low yield, no specialty. |

### Guerreiro

Takes the hit, closes the wound alone, and kills. Melee is the strong path. A rifle or crossbow works, with a weaker skill at the same rank.

| Skill | Kind | Role |
| --- | --- | --- |
| Golpe pesado | active, melee | The kill button. Scales with strength. |
| Avanço | active, melee | Closes distance and strikes. |
| Tiro de serviço | active, ranged | The shot for a rifle or crossbow. Weaker than Golpe pesado. |
| Execução | active | Extra damage on a target already low. |
| Postura | active, buff | Raises block chance for a few turns. |
| Cicatrização | passive | Regenerates HP in combat much faster than the other classes. The heal is the body closing. |
| Pele de trincheira | passive | Higher max HP. |

### Comerciante

Power sits in the city. In a fight the character arrives well equipped and shoots. Someone who forces the front line holds a little, and does not become a Guerreiro.

| Skill | Kind | Role |
| --- | --- | --- |
| Margem | passive, city | Shop and auction sales pay more. |
| Pechincha | passive, city | Cheaper buys: title, auction, inputs. |
| Folha em dia | passive, city | The same pay keeps a worker longer. Ties to the rule that production stops when daily pay is missing. |
| Armazém | passive, city | Building storage fills later. |
| Disparo de prateleira | active, ranged | The shot. Scales with weapon quality. |
| Kit de campanha | passive, combat | Gear quality becomes HP and damage at the start of the fight. The money was spent before the fight, at the workshop and the market. |
| Linha improvisada | passive, combat | On the front, a small block chance. |

Left out of the base list: an active that burns credits for a strong shot. In an autobattler the policy would spend money without the player choosing the moment. It could later replace Linha improvisada.

### Cientista

| Skill | Kind | Role |
| --- | --- | --- |
| Centelha | active, electric, single | The first spell. High mana, high cooldown. |
| Nuvem | active, chemical, small area | Cooldown higher still. |
| Falha explorada | active, hack, single | Scales with intelligence. |
| Sobrecarga | active, electric, all hostiles | Very high mana and cooldown. At rank 1 it barely fits in a fight. At a high rank it is the legendary moment. |
| Condutor | passive | Raises max mana. Without it, Sobrecarga does not hold. |
| Pesquisa | active, city | Time spent studying. The main experience source, and the chance to find a blueprint part or a whole blueprint. |
| Protótipo | passive, city | Incorporating a blueprint starts the resulting tech or skill stronger. |

## Engine today

The combat motor resolves damage, heal, self-buff, mana, and cooldown. Passives, a real execute, and every city skill are design-only until a later slice. A few catalog moves already rhyme with this list (`defensive_stance`, `int_spike`, `fireball`) and are not these skills.

## Still open

- Level required to seek a profession, and where the character seeks it.
- Skill points granted per character level, max skill rank, and prerequisites.
- Attribute bias per profession.
- Tuning numbers for power, mana, cooldown, and economic percentages.
- Second job.
- Which of these skills ship in the first implementation slice.
