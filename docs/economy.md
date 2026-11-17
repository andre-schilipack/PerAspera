# Economy

**Status:** Design intent for the base concepts. Not an implementation spec.  
**Date:** 2026-10-06

The first building catalog is below. The tech list, contract types, and the percentages stay open. This doc locks the nouns and the rules that decide who produces, who gets paid, and what is lost.

Durable loop constraints live in `docs/act1-player-loop.md` and `.cursor/rules/peraspera-vision.mdc`. Class skills that touch the city live in `docs/classes.md`.

## What the economy is

The economy is the backbone of the city's power. It is how equipment, ammunition, resources, and infrastructure get better. The nightly wave is the sword: it defends today. Stamina spent on the economy strengthens the macro. Stamina spent on science strengthens tech. Science is the mind of the city.

Any class can do any of the three. Some characters run production. Others hold creds and buy. Another character is another stamina pool, and that is the strongest move until a later pass limits how many characters an account fields.

The lore is a technological and social downgrade, and also a city that does not tax a private site. Progress comes from the player as entrepreneur. A public work action is the exception: a slice of that action's items goes to the city stock.

The save is alive. The economic tick and stamina recovery both run while the player is offline.

A new game has the civic places, plus two businesses the Prefeitura already owns. The hex layout can still change. These two businesses do not.

The farm is public, and its worker slots start full. The Prefeitura staffed it so the city has food. A character who works it receives the items they harvested. They do not receive creds. Twenty percent of that harvest stays with the Prefeitura. The thermoelectric plant is not public. It burns coal and feeds the power pool. Wind generators are a later build. They are not in the seed.

## Two clocks

The city runs on the economic tick: 30 minutes of real time. Forty-eight ticks are one wage day. The wage day is also the civil day.

The character runs on stamina. Stamina replaces grind time. It does not replace the tick. Property keeps producing while the character is offline, up to the catch-up cap already in the sim. Stamina also recovers offline. A few daily-limited events and items add a little more on top of that recovery.

Missing a day does not by itself sink the city. Neglect does. If nobody feeds the civilians, houses them, or keeps the power pool up, the city stops growing and the wave eventually takes it. For one household, a missed day costs output only when a worker quits or storage is full. Once other players share the run, a missed day can also cost the fame race.

## Where stamina goes

| Spend | What it strengthens |
| --- | --- |
| Nightly defense | Today. The sword. |
| Economy | The macro: food, resources, housing, power, equipment, ammunition. |
| Science | Tech. The mind of the city. |

## City stocks

These are the stocks of the city. They are not the building list.

- **Power.** One city pool. Civilians and industries draw it. Players build the supply.
- **Food.** What keeps civilians fed.
- **Resources.** Matter that becomes equipment, ammunition, and construction.
- **Civilians and workers.** Workers are drawn from the civilian population.
- **Housing.** Slots the civil sector lives in.
- **Consumer goods.** The ordinary demand of the civil sector.
- **Equipment market.** The same order book as every other item. A character can produce gear or buy it.
- **Property for sale.** Title the player buys and may resell.

## Civil day

Once per wage day the civil sector consumes four things: food, consumer goods, power, and housing.

Food and consumer goods are items. The civil day draws them from the Prefeitura stock first. The Prefeitura posts buy orders only for the shortfall. Players supply that demand by selling into the book. The quantities and the exact item ids come later.

Power is not an item. It is subtracted from the city pool.

Housing is not an item. It is a slot in a housing site.

The civilian count grows on a civil day only when three gates pass:

- **Fed.** The day's food demand was filled.
- **Happy.** The day's consumer-goods demand was filled, and the city did not brown out.
- **Housed.** A free housing slot exists.

A finer mood model stays open. A brownout day is not a happy day, so the population does not grow.

## Power

There is one power pool for the city.

Civilians draw from it on the civil day. Industries draw from it when they run. The pool grows only from power sites players build and keep running, on top of whatever the founders already left.

If the pool cannot cover the draw, the city browns out. Building in the power sector is what keeps that from happening. The combat and production penalty of a brownout, beyond the lost growth day, stays open.

## Housing

Players build housing. Each housing site adds slots to the civil pool.

The owner profits when the civil sector takes those slots. Whether that profit is a sale, a rent, or both stays open. The slot rule does not: without a free slot, the population does not grow.

## Order book

The market is one order book for every item in the game. It replaces a fixed price list.

Players and the Prefeitura post buy orders and sell orders. The book groups each item by price. Inside a price, the earlier `created_at` executes first.

Creating a sell order removes that quantity from the character's personal inventory. Creating a buy order reserves the creds. Pulling an order back returns what it reserved. A fill moves the item to the buyer and the creds to the seller.

A good sits in exactly one place: a resting order, a character inventory, or a site storage.

The alpha municipal catalog, with one number for buy and sell, is the stand-in for this book.

## Title

A place slot has an owner.

The Prefeitura owns public works and the land exploration just opened. The player buys that title with creds and may resell it.

Public works are not for sale: the city hall, the quartel, the municipal market, the parents' home, the historian.

Work on land you own keeps the full yield of that labor. The owner's own work action is not split.

## Public work

A saved business has `public` and `publicWorkTax`.

`public` defaults to false. While it is false, only the owner may take the work action. The tax field is stored and does nothing. Passive production is not split by this tax.

`public` true lets another character take the work action. In Act 1 that is another character of the same player. Later it is another player. The character spends stamina and receives the items that action produced, minus the tax. They do not receive creds.

`publicWorkTax` defaults to 20%. The owner may set it from 0% to 100%. That percentage of the action's items stays with the site's owner. The character keeps the rest. On the Prefeitura farm the owner is the city, the tax is locked at 20%, and that slice goes to the Prefeitura stock.

The seed farm is the public harvest. The seed thermoelectric plant is Prefeitura-owned and not public. A Prefeitura site is not public unless it is marked so.

The Prefeitura stock is the city's pantry. The farm's assigned workers fill it, and so does the 20% left by public harvest. On the civil day, food and consumer goods are drawn from it first. The Prefeitura posts buy orders only for the shortfall. A filled buy order lands in the same stock.

## Site

A private site has one role. A site is not a profession. Any character may hold the title. A shop building is not a second market. Sales happen on the order book.

| Role | What it does |
| --- | --- |
| Harvest | Generates a raw good. No input. The seed farm is one. |
| Transform | Consumes stored inputs and city power, and emits an output. |
| Power | Adds to the city power pool. |
| Housing | Adds civil housing slots. |
| Service | Sells a use of the building, not a good. The hospital is one. |

Civic places stay out of this catalog: the city hall, the quartel, the municipal market, the parents' home, the historian.

### Building record

The catalog is data. The save stores the lot, not the recipe table.

A catalog entry has an id, a role, one or more recipes, a power figure per day, housing slots, storage slots, and worker slots. Power is positive when the site feeds the pool and negative when it draws. A recipe is inputs and outputs. Harvest inputs are empty. Housing and the hospital output no item.

A saved business points at `buildingId` and `recipeId`. It keeps level, assigned workers, wage, storage, the passive output buffer, `public`, and `publicWorkTax`. It does not keep a behavior enum.

These fields are alpha and leave when the catalog lands: `type`, `credsPending`, `industrialRecipe`, `fabricaRecipe`, `outputItemId`, and `productionRate`. Base throughput lives on the catalog entry and scales with workers and level. `loja` is not a catalog building. Creds come from the order book.

The passive output buffer can stay for this change. Folding it into storage is a later cut.

### Catalog

Sixteen buildings. Rates and storage sizes stay open. Construction supplies are the one-time cost of raising a new site, not a tick output.

| Building | Role | Recipe | Power |
| --- | --- | --- | --- |
| Fazenda | harvest | emits `food_ration` | draws |
| Sucateira | harvest | emits `scrap_metal` | draws |
| Madeireira | harvest | emits `wood_log` | draws |
| Pedreira | harvest | emits `cement` | draws |
| Fundição | transform | `scrap_metal` → `metal` | draws |
| Serraria | transform | `wood_log` → `lumber` | draws |
| Carvoaria | transform | `wood_log` → `coal` | draws |
| Fábrica de construção | transform | `metal` + `lumber` + `cement` → `construction_supplies` | draws |
| Oficina | transform | `metal` + `lumber` → mace, crossbow, or shield | draws |
| Cartucheira | transform | `metal` → `ammo` | draws |
| Ateliê | transform | `lumber` → `consumer_goods` | draws |
| Termelétrica | power | burns `coal`, adds a large amount to the pool | supplies |
| Eólico | power | no input, adds a small amount to the pool | supplies |
| Moradia | housing | no item; adds civil housing slots | draws a little |
| Laboratório | transform | no item input; emits `tech_consumable` | draws; that draw is the whole recipe |
| Hospital | service | no item; restores 30 HP | draws |

The pedreira exists because the construction factory already requires cement and nothing produces it. The sucateira replaces `outro`.

The oficina is the only building with more than one recipe. The lot stores the chosen `recipeId`. Every other building has one recipe.

`ammo`, `consumer_goods`, `coal`, and `tech_consumable` are new items. Character stimulants (mate, stim, dorplex) are not the civil consumer good, and they are not the lab's output.

A tech consumable is spent. It is not a blueprint. Pesquisa still finds blueprint parts. The lab's only input is power from the city pool. Manual work there also spends stamina, like any other work action. Assigned workers do not spend stamina.

The hospital sells Cura. One use restores 30 HP outside combat. The fight log does not change. The price is not set.

Scrap feeds the smelter. Logs feed the sawmill and the charcoal works. Charcoal feeds the thermoelectric plant. The seed plant is the city's. Wind eats no fuel, and each generator adds less than the plant. Players build wind later.

A later recipe may turn cement into the existing concrete patch, so wall repair also goes through the economy. It is not in this catalog.

## Storage

Each site has finite storage. Passive output lands there.

When storage is full, that tick's output is lost. The stockpile stays.

Claim and withdraw move stock into the character inventory. They do not create goods. A sell order is the only way onto the book, and it starts from that personal inventory.

## Workers

The civil pool is `floor(civilian population / civilians per slot)`. The population grows only on a civil day that passes the three gates above.

Assigned workers produce every economic tick.

Once per wage day the owner pays `workers assigned × wage` for that site. If the owner cannot pay, every worker on that site quits. Production on that site stops until someone is hired again.

An economic skill matches a business type. It raises productivity for that type. The percentages stay open.

The owner's skill raises the workers on businesses of that type that they own. A farm owned by a character with harvest skill 5 runs faster than a farm owned by a character with harvest skill 1. The seed farm's workers stay at the base rate. The city is not a character and has no skill.

City skills may later change how long the same pay keeps a worker, how large storage is, or what a sale pays. They do not replace the wage.

## Character labor

It costs stamina. The character is on that hex.

Economic skills do not reset. Level 0 cannot perform that work. Another specialty is another character.

Aspirante's only economic labor is Mão na massa: low yield, no specialty.

Harvest skills scale harvest output. Transform skills scale transform output and reduce input. The same skill scales the workers on a business of that type that the character owns. The percentages come later.

On owned land, that labor yield belongs to the character. Manual work on a public harvest uses the worker's own skill, then the site tax is taken from that yield. Skill 5 on a harvest produces more than skill 1 before the 20% is removed.

Owning and staffing do not require the craft skill. Performing the specialty labor does.

Guerreiro's first-pass tree has no city skill. The title and the workers still work. Specialty labor waits for a skill on the sheet.

## Blueprint

A blueprint is an item: a part, or a whole.

Intelligence work finds it. Pesquisa is the main way.

It can be sold before it is used. That sale is the scalp. The sale is an order on the book.

Incorporating consumes the item. The tech or the skill belongs to that character only.

Protótipo makes the incorporated result start stronger.

## Creds

Creds are the only money.

They leave the character when a buy order is created, and they arrive when a sell order fills. Wages, titles, and wall repair spend them too.

There is no tax on creds, and no tax on a private site's passive output. `publicWorkTax` takes a slice of the items a public work action just produced. It does not pay the character in creds.

## Contracts

A contract spends the stamina of the characters enlisted on it. In Act 1 those characters belong to the same player.

Exploration and extraction are the two jobs already named. The contract catalog stays open. The expansion contract in the build is one exploration stand-in.

## Alpha stand-ins

The build does these. They are not the rules above.

- The municipal catalog is a fixed list. Buy and sell use the same number. There is no order book and no daily Prefeitura demand.
- A loja adds pending creds per worker with no stock.
- Production buffers are unbounded. The player claims them by hand into inventory.
- Active Work on an indústria or fábrica grants items and does not consume inputs. The passive tick does consume inputs.
- Power is a lone generation and consumption number. No power building feeds it. Industry and civilians do not draw it. A brownout only chips a stability index.
- Civilian population is a constant. There is no housing.
- The seed has no Prefeitura farm and no thermoelectric plant. The farm is not public, and it does not start fully staffed.
- Characters have no economic skills.
- An empty lot can be bought. It cannot be resold.
- Business kinds are the five placeholders above.

## Still open

- The tech list. The first building catalog is named above. Rates, storage sizes, and worker slots per building are not. The skill bonus per level is not. Prices are not, including the price of Cura. One use of Cura restores 30 HP.
- How the seed thermoelectric plant is fueled before a player builds a carvoaria.
- Prefeitura buy-order sizes and item ids. The orders cover only what the city pantry did not already hold.
- Where the Prefeitura's creds come from. The seed farm's daily wages and the city's buy orders spend them. Public harvest does not pay creds.
- What the city does with pantry goods that are not food or consumer goods.
- Housing profit: sale, rent, or both.
- The combat and production penalty of a brownout, beyond the lost growth day.
- A finer rule for happy, beyond consumer goods filled and no brownout.
- The economic skill table and the percentages. The first skill sketch stays in `docs/classes.md`.
- Contract types beyond the rule that a contract spends enlisted stamina.
- How many characters an account may field.
- What fame buys.
