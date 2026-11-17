# Attributes and SimulCombat

**Status:** Product contract (intent). Not an implementation spec. Not a combat-engine ADR.  
**Date:** 2026-11-17  
**User-facing names:** Portuguese. Code keys stay English.

This is the destination model for character attributes and how autoplay (SimulCombat) uses them. The live engine does **not** match this file yet. Do not treat the current `simulate.ts` / `skillPick.ts` behavior as the contract. Do not start an engine rewrite from this document; that is a later session, after this contract.

Related: `docs/classes.md` (professions and skills), `docs/act1-player-loop.md` (run loop), `docs/adr-combat-engine.md` (headless log / playback — leave it), `.cursor/rules/peraspera-vision.mdc` (citizen, not mayor).

## What this is for

The player is the **coach** of a unique character. The character fights alone. The player decides training, loadout, gear, and what happened before the fight. During the fight the system decides. High Intelligence makes the right play *more often*. It never deletes misfortune.

The coach feels “last hit no chefão” and “curou a pessoa errada” while **watching** the live fight or the replay — turn by turn, with the HP and positions as they were when the move fired. The **log does not judge**. It only states what happened (who used which move, on whom, quality, whether the target died). See Combat log.

AlgoCombat (player-written priority lists) stays parked. Saves may still hold programs; no fight receives one. `combatBeatPhase` (approach / contact / endgame) is not the picker brain.

## Code today (not the destination)

Live sheet: `strength`, `agility`, `intelligence`, `vitality`, `charisma`, `willpower`. Everyone spawns at 1. No attribute level-up. `level` / `exp` scale nothing. Max HP is `PLAYER_BASE_MAX_HP` (42), not Vitality.

Scattered live effects: melee internals scale Strength; `basic_attack` is flat; Agility is speed and dodge; Vitality is block chance, not HP; Intelligence biases the argmax picker and scales INT moves; Charisma is hardcoded into heal; Willpower is unread. Mana is 0. Buff statuses are written and never read.

Destination drops Willpower, adds Dexterity, and gives every remaining attribute a body job and/or a SimulCombat taste. Until a later slice, old saves may still carry `willpower`.

## The star

Six attributes. Cap **99**, Ragnarok-like growth (points per level and starting spread stay open). Pairs are how a player *builds*, not a hidden combo multiplier. The engine does not multiply Strength because Vitality is high.

| Pair | Attributes |
| --- | --- |
| Body | **Força** (`strength`) — **Vitalidade** (`vitality`) |
| Hands | **Agilidade** (`agility`) — **Destreza** (`dexterity`) |
| Mind | **Inteligência** (`intelligence`) — **Carisma** (`charisma`) |

**Willpower is out.** Combat breath is Vitality. Sustaining a Cientista tech skill is cooldown, rank, and any consumable the move spends. Choosing to retreat is Intelligence in the picker. Precision belongs to Dexterity. Ragnarok-style Cast Time does **not** come with Dexterity: Act 1 has no spells to wind up. If a later Act 2 channeling profession needs a cast time, reopen the contract; do not park it on Dexterity.

## Two layers

**Body** — stable numbers on the unit even with an empty loadout (HP, speed, fôlego pool, precision points, natural defense, …).

**Taste (gosto)** — given the legal loadout, SimulCombat **weighted-rolls** the action. A high attribute raises the chance of moves that name it. It does not guarantee. Situation can add weight. This is not “highest score wins” (that is the live picker bug).

A move may name more than one attribute. The move owns the coefficients. Rank and the equipped weapon enter when the move says so. The same attribute is not applied a second time on top of the move.

## Attribute jobs

| Attribute | Body | Taste in SimulCombat |
| --- | --- | --- |
| **Força** | Damage of moves/weapons that scale with it. Heavy-weapon requirements. **blockPower** when the character chooses to block. | Weights melee strikes, advance, execute, hammers. Weights *choosing block* when a shield/weapon can block. |
| **Vitalidade** | Max HP. Natural defense. Combat **fôlego** pool. Tiny baseline regen (Fôlego curto / Cicatrização are what the player reads). | Weights stance, holding, self-body skills. |
| **Agilidade** | Time between actions. **Dodge points** (used only if the character chooses to dodge). | Weights reposition, evasion buffs, *choosing dodge*. |
| **Destreza** | **PrecisionPoints** (see to-hit). Damage of weapons that declare Dexterity — especially ranged. | Weights shots, bows, anything that asks for aim. |
| **Inteligência** | No passive damage aura. | How hard **situation** weighs: heal, execute, rest fôlego, Recuar, don’t dump AoE on one body, dodge vs block. Also weights the tech skill or gadget that names it. Retreat as a *choice* lives here. |
| **Carisma** | No passive weapon damage. Heal and buffs: the move declares the coefficient. | Weights heal, mark, ally buffs. City layer (fame, buy price) is **open** and stays out of HP math. |

Intelligence does not add a global bonus to “tactical” tags. That is the live `skillPick.ts` bug. Intelligence makes the character listen to the fight more. It is not a damage aura.

Charisma is not money and not weapon damage. Fame and buy-price effects, if any, are specified later on the city layer. They must not feed `AttackerDamageCalc`.

## Readable builds (profession is not the attribute)

Profession still shows up through skills and gear (`docs/classes.md`). Placement (frontline / ranged / support) stays a player choice. Attribute bias on job change is still open.

- **Guerreiro de linha** — Strength + Vitality, melee. Few expensive swings, big bar, natural defense. Low Agility: they take it. Picker pulls strike. Intelligence decides whether they Recuar or die well.
- **Guerreiro de trincheira** — more Vitality than Strength. Postura. Fôlego lasts. They *eat* hits with HP, chest armor, and block (Strength + shield), not because they became a fencer.
- **Comerciante atirador** — Dexterity, good gun/crossbow. Strength does not scale firearm damage. Weapon precision starts bad; Dexterity and the bought piece are the pre-fight work. Charisma 1 is a mute shooter. High Charisma is a different citizen (heal / shout), same profession allowed.
- **Cientista** — Intelligence. Act 1 kit is **technology and brought consumables**, not magic and not mana. Early gadgets are weak (long cooldown, or they spend a cell / vial the coach packed). Most of the fight is a simple strike. When the gadget is ready, Intelligence weights using it and on whom. Dexterity is not this class. Vitality low means little fôlego if they have to swing.

## Combat resources

Daily **stamina (STA)** is already the session resource (patrol, wall lock, contracts). It is not spent by swinging.

Combat **fôlego** is a different bar. Vitality 1 ≈ three attack actions, then the body needs air. That “≈3” is vision, not a locked constant.

- The move declares fôlego cost. A simple strike costs 1. A warhammer costs more.
- Cientista **tech** skills in Act 1 cost **cooldown** and/or a **consumable packed for the fight**, not fôlego and not mana. Otherwise every gadget-user must stack Vitality to exist.
- Empty pool: the legal action becomes recover fôlego (a visible pause). The coach watches the character wheeze in the street.
- High Intelligence weights resting *before* emptying in melee. Low Intelligence dumps the three hits and stands there.

### Mana and magic (not Act 1)

**Mana does not exist in Act 1.** In the lore, magic does not exist yet.

It enters the world when Cientistas push the tech far enough to experiment on a **fragment of the magical meteor**. From that work a later profession can specialize in channeling that energy. Only **Act 2 onward** does the resource become less rare among people.

Do not put a mana bar on the Act 1 sheet. Do not hand max mana to Intelligence, Vitality, or Willpower by inertia. When Act 2 opens that contract, the channeling job and its resource are specified then. Act 1 Cientista combat is gadgets, hacks, chemistry, and items brought to the field.

HP remains a calendar resource. Part injury (below) is a second, explicit axis — not a hidden extra HP bar with no UI.

## SimulCombat picker

Legal set: equipped, off cooldown, weapon compatible, cost payable (fôlego and/or a packed consumable). No mana gate in Act 1.

Every legal action has weight above zero. Named attributes raise the weight of their moves. The favorite is the **mode** of the roll; the others still come out.

Situation (closed list) can add weight. Intelligence scales how much that list matters. Low Intelligence ≈ nearest target + the build’s favorite skill, with regular disasters. High Intelligence lets wounded-self / downed ally / empty fôlego / execute / Recuar / wasted AoE / dodge-vs-block actually move the dice. Disasters remain possible at the Intelligence cap. The player, watching, is the one who yells. The log only reports the facts.

Closed situation list:

1. Wounded ally, and a support action is in the loadout.
2. I am wounded, and stance / defensive buff / Recuar is in the loadout.
3. Enemy in melee range, and a melee action is in the loadout.
4. Enemy low, and an execute is in the loadout.
5. Fôlego about to empty (rest vs last swing).
6. Incoming contact: choose **dodge** or **block** (see to-hit).

`combatBeatPhase` is not an input to this lottery.

### Targets

Weighted lottery, not argmax. **Nearest enemy always has the largest slice**, at every Intelligence. Intelligence reshapes toward the “right” tactical target (low HP if execute is ready, marked by Grito de alerta, most-wounded ally on a heal). Never 100%. A heal on a less-hurt ally, or a kill that was not the one the coach wanted, still happens at the Intelligence cap; they only get rarer. The log names the target. The coach decides it was wrong.

Attributes do not pick row or class. Heal still *tends* toward the most wounded ally because that is the action’s rule, amplified by Intelligence and Charisma — the character does not become the player.

### Retreat

Encounter-level flee (HP fraction + chance in today’s `simulateBattle`) can remain the theater floor.

The character *choosing* to leave is Intelligence in the picker (Recuar, disengage). High Intelligence leaves at the right HP more often. Low Intelligence panics early or never leaves. Intelligence is not a hidden reduction of a flee roll.

## One swing (watch order)

1. Picker rolls the action.
2. Picker rolls the target (nearest is the mode).
3. Spend fôlego and/or start cooldown, as the move says.
4. Defender chooses **dodge or block** (not both).
5. Build **PrecisionPoints**, then resolve quality (and dodge, if chosen).
6. If the quality is a miss: no location, no HP, no part chip. Log it.
7. Else roll **hit location**.
8. **AttackerDamageCalc** (weapon + move coefficients + rank + quality multiplier).
9. **DefenderDamageCalc** (Vitality natural defense + armor of that part; if blocking and the block connects, Strength **blockPower** cuts a lot of damage). A **blocked critical** is legal: quality is still crit, damage is still high, block then acts on that number.
10. Remainder goes to HP. The location also chips that part’s health. The log states facts only (see Combat log).

## To-hit and quality

Attributes grow toward 99. Precision is a **point pool**, then a **table**. There is **no extra roll** after the net number: the number *is* the quality.

Sketch (coefficients are examples, not locked):

```
PrecisionPoints =
    DEX * 1
  + MovePrecision
  + WeaponPrecision      // e.g. bow = -50
  + basePrecision        // e.g. 50
```

Injured parts can further modify PrecisionPoints (see Parts). Buffs such as Concentração belong in MovePrecision or a later explicit term — numbers open.

If the defender **dodges**:

```
NetPrecision = PrecisionPoints - DodgePoints
```

`DodgePoints` come from Agility (formula open). High dodge can push a would-be crit down to hit, graze, or miss. That is the Agility sentence: “aquele drone é rápido.”

If the defender **blocks**, dodge does **not** subtract. `NetPrecision = PrecisionPoints`. Quality is more likely to stay hit/crit; the character is betting on **blockPower** instead of not being there.

`NetPrecision` maps on a **table** to:

| Quality | Intent |
| --- | --- |
| Errou (miss) | No damage, no location. |
| Raspão (graze) | Weak multiplier. |
| Hit | Normal multiplier. |
| Critical | High multiplier. |

Exact band cuts stay open. The 50 / 80 / 95 figures from early talk were the *idea* of a table, not a raw d100 that everyone misses half the time. Dexterity and weapon penalties **shift the net number**; the table reads that number. A Dexterity-1 citizen with a rifle sits in miss/graze. A made shooter sits in hit, with crits that exist.

Miss from a low net (attacker imprecise, or defender dodged the shot off the table) is the same math. The log may name a miss, a graze, or a dodge as facts. It does not narrate whose fault it was.

## Dodge or block (defender choice)

The character picks **one** per incoming hit:

- **Dodge** — Agility characters. Spends dodge points against PrecisionPoints. If it works, quality drops (possibly to miss). No blockPower.
- **Block** — the character *gives up dodge* and tries to block. Chance comes from **shield / weapon block chance + buffBlockChance** (Postura and similar). **blockPower** scales with **Strength** and cuts damage a lot when the block connects.

Failed block: full quality damage, and dodge did not apply. The log records that the block did not connect. The coach supplies the curse.

Blocked crit: quality is crit (AttackerDamageCalc still high), then blockPower acts. Legal and desirable to watch.

Picker taste: Agility weights choosing dodge. Strength + a blocking weapon/shield weights choosing block. Intelligence weights picking the right one for the incoming move (heavy hammer → block, precise shot → dodge) without guaranteeing it.

Agility is **not** a body block-chance stat. Block chance lives on gear and buffs. Agility’s defensive body stat is dodge points, and only on the dodge path.

## Damage split

**AttackerDamageCalc** (after quality is known, miss already out):

- Weapon
- Attributes the **move** names (e.g. Cura `base 10 + 1*INT + 1.5*CHA`)
- Skill rank
- Quality multiplier (graze / hit / crit)

The move is the recipe. The weapon is an ingredient, not a second strike on top.

- Golpe pesado: a lot of weapon + Strength.
- Disparo de prateleira: weapon quality + Dexterity.
- Bow: weapon + Dexterity + some Strength (the bow declares Strength).
- Crossbow / firearm: weapon + Dexterity, Strength coefficient 0. Precision penalty on the weapon.
- Warhammer: Strength requirement, high Strength coefficient, attack-speed penalty, expensive fôlego.
- Cientista gadget (e.g. a spark cell, a chemical cloud, a hack): little or no weapon; Intelligence; cooldown and/or a packed consumable. Not fôlego. Not mana.

**DefenderDamageCalc**:

- To-hit half: `PrecisionPoints - DodgePoints` when dodging (see above).
- HP half: Vitality natural defense + **armor of the hit location**. If a block connected, Strength blockPower.

Order of HP reductions (subtract vs factor vs cap) stays open.

## Parts, gear, injury

Hit locations and gear slots are the **same six**. Arms and hands are both hittable, both have their own piece, and injured they debuff **differently**.

| Location | Gear | Injury intent (coefficients open) |
| --- | --- | --- |
| Cabeça | Helmet | Precision (and anything that needs a clear head). |
| Peito | Chest | The meat: HP and armor. Default place to get hit. |
| Braços | Arm guards | **Strength calcs and precision** (declared: arms at 20% health pull STR and precision down). Melee output and blockPower suffer. |
| Mãos | Gloves | Different from arms: grip / trigger. Precision and weapon handling harder; less of a Strength story than arms. |
| Pernas | Greaves | Dodge points. |
| Pés | Boots | Speed (time between actions). |

Each part has its own **health %**. Example (numbers not locked): arms at 20% health; a part-specific injury item heals 60 percentage points → arms at 80%; that 80% then feeds Strength and precision. Whether heal is additive points vs percent-of-missing stays open; the example is additive.

**Persistence (locked):** part health **survives the battle**. An in-fight item can heal a part. The hospital (out of fight) can heal a part. Calendar HP and part health are both things the coach treats after the night.

Miss does not roll a location and does not chip a part. How much a graze / hit / crit chips part health stays open. 0% on a part is the worst penalty; whether the slot “breaks” (cannot hold the weapon, cannot block) stays open.

Part-specific medical items are a war-logistics sink (cures, splints). Hospital already exists for HP; it also treats parts.

## What no attribute does

- Guarantee an action, a target, a crit, a last hit, a dodge, or a block.
- Pick row (`combatRole`) or profession.
- Spend or restore **daily STA**.
- Grant mana, shorten cooldown, or pay a spell cost. Act 1 has no mana and no spells.
- Resist statuses (live statuses are unread; when they do something, skill or gear).
- Be Dexterity and Agility at once (precision is not attack speed).
- Be Strength on a firearm (the weapon’s coefficient is 0).
- Apply the star pair as a hidden multiplier.
- Put Charisma into weapon damage, Intelligence into max HP, or Dexterity into Cast Time in Act 1.
- Feed fame or shop prices into HP damage.

## Open on purpose

Formulas, band cuts, quality multipliers, DodgePoints-from-Agility, blockPower-from-Strength, weapon precision penalties, fôlego per move and pool per Vitality, situation vs attribute vs nearest weights, how hard Intelligence bends targeting, points per level, start spread, profession attribute bias.

Exact heal/buff coefficients (the move declares them; Cura `10 + 1*INT + 1.5*CHA` is an example).

Charisma on the city layer: fame conversion, buy price. Specified later. Out of SimulCombat until then.

Wound chip per quality. 0% part behavior. Hospital: one action vs HP and parts, or separate verbs.

Act 2 mana / channeling profession: reopen this contract when that job exists. Do not assign mana to an Act 1 attribute.

Which future skills name which attributes. The Comerciante kit today has no Charisma combat skill; that is filled in `docs/classes.md`, or Charisma stays a support-loadout story. It is not a reserved stat with no moves.

Immobile units (tower, nest, city hall): dodge/block/fôlego. Later.

## Combat log

The canonical event log is the truth of the fight. Replay is playback of that log. The log is **factual**. It never editorializes (“wrong target”, “wasted heal”, “should have killed the other one”).

The player watches live or in replay, turn by turn, and sees the momentary state (HP, range, who was about to drop) when the character acted. **The player judges.** The log only names the act.

Every damaging hit that lands includes the **final HP damage** (after DefenderDamageCalc: armor, Vitality, blockPower). That number stays on a **last hit** too — the kill flag does not replace it.

Shape (Portuguese, wording open; the damage integer is not):

- Strike: `X usou MoveY e acertou [de raspão] inimigo ChefãoZ em 12, matando-o.`
- Hit without kill: `X usou MoveY e acertou inimigo ChefãoZ em 12.`
- Miss: `X usou MoveY e errou inimigo ChefãoZ.` (no HP number — nothing landed)
- Heal: `X usou Cura em AliadoY (+8 HP).` (who was healed, how much — not whether it was wise)
- Block / dodge that changed the hit: flags on the same factual line (blocked, dodged), not a moral. If the hit still dealt HP, the final number is there.

Quality words that are **facts** stay: de raspão, acertou, crítico, errou, bloqueou, desviou, matando-o, and the HP delta. Coaching words do not: errado, desperdiçou, burro, perfeito.

## Out of scope here

- Rewriting `docs/adr-combat-engine.md`.
- Engine refactor plan, file list, or implementation order.
- Reopening AlgoCombat.
- Tuning passes (`constants.ts`, nightly budgets).
