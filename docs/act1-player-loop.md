# Act 1 player loop

**Status:** Design intent, not an implementation spec  
**Date:** 2026-10-01

Decisions from the Act 1 fantasy. Systems named under [Not specified yet](#not-specified-yet) stay unnamed until a later pass. Durable constraints also live in `.cursor/rules/peraspera-vision.mdc`.

## Promise

An official run lasts 30–90 days. Grind time becomes the character's stamina. A session delivers progression and decisions.

In the first days the character does the manual labor. As industries, property, and workers come online, production runs on its own and stamina moves to exploration, contracts, and player-made shops.

## How a run is won

The primary goal is the city surviving the run.

The secondary goal is the eternal top 10 fame ranking of that official run. Fame has no build benefit yet. It is the honored path.

Missing a day does not by itself stop the city from surviving. The save is alive: the economic tick and stamina recovery run while the player is offline. If nobody feeds the civilians, houses them, or keeps the power pool up, the city stops growing and the wave eventually takes it. Once other players share the run, a missed day can also cost the dream of being number 1.

## Who plays

Act 1 is one player and several characters. Each character has their own stamina. Co-op is a contract staffed by the player's own characters. A shared-world MMO is later.

Replaying Act 1 requires a new character.

A character who survives an Act 1 victory is locked and available for Act 2, together with that city's save. Act 2 lore and feats come later.

The account gains levels at the end of a run.

The day starts at the parents' home hex, inside the conquered city perimeter. Walking that perimeter, checking fame, the shared story (the old man), battle history, and combat replays are part of the session. Lunch or dinner at the parents' home restores 15 stamina, once per day.

## City and household

The city hall (Prefeitura) owns public works and the new land that exploration opens. The player buys that title from the city hall and may list it for sale afterward.

A new game adds two Prefeitura businesses to the civic places: a public farm with full workers, and a thermoelectric plant that is not public. A character who harvests the farm keeps the crop minus 20%. They are not paid in creds. Work on land you own keeps the full yield. Detail is in `docs/economy.md`.

Workers sit on auto-production. While the player is away, property produces into storage. A good sits in a site storage, a character inventory, or a resting order on the book. Production is lost only if a worker quits for lack of daily pay, or if the building's storage is full. Civil demand, housing, the power pool, and the order book are in `docs/economy.md`.

## Craft

Economic skills do not reset. Level 0 cannot perform that work. Each character specializes in their own area. Another build is another character.

Harvest skills scale output. Transformation skills scale output and reduce input. The same skill also raises workers on a business of that type that the character owns. The percentages come later.

Intelligence work discovers blueprint parts or whole blueprints and sells them. Incorporating consumes the item. The tech or skill belongs to that character only. Scalping happens on the blueprint before it is used.

## Professions

Every character starts as Aspirante. From a set level, they seek one Act 1 first profession: Guerreiro, Comerciante, or Cientista. No multiclass and no reset. The skill-tree first pass is `docs/classes.md`.

## Combat

Night Defence happens every night at a set time. Monsters arrive, and the city holds or it does not. Waves should feel threatening. A city that does not neglect defense repair gets through.

The canonical combat log is the truth of the fight. A later TFT-like view plays that log back. It does not re-simulate the battle.

The city arena has friendly PvP and betting. Details come later.

Characters decide actions from intelligence and build (Pretty Derby–like). The player watches.

## Where the feeling comes from

- **Terraforming Mars.** Early generations are a poor hand. Late generations are a full one, because the engine produces enough to afford several options.
- **Ymir.** The economy, the industries, and the craft skills.
- **Ragnarok Online.** A world you walk, exploration, and progression.
- **Pretty Derby.** A character's career, and autobattle driven by intelligence and attributes.

## Not specified yet

Economy nouns, the civil day, the order book, and the first building catalog are in `docs/economy.md`. Leave these unnamed until a later pass:

- Attributes — destination contract: `docs/combat-attributes.md`. Point grants per level and profession bias still open.
- Statuses
- Level up
- Techs
- Contract types
- Economic skill table — a first sketch sits on the class skills in `docs/classes.md`; the full table and the percentages stay open
- What fame buys
- Act 2
