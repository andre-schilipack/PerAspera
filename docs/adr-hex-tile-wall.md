# ADR: structural HP on `HexTile` features (wall + city_hall)

**Status:** Accepted  
**Date:** 2026-04-21  
**Context:** nightly defense, Prefeitura siege, encounter combat (`encounterCombat` / `encounterCombatRound`).

## Context

Early iterations modelled the perimeter wall as a separate persisted object (`WallState` with four cardinal sections) and kept defense HP outside the world map. That split increased migration cost, allowed drift between UI and simulation, and did not match the product rule that a **raid anchor hex** should own the sector’s structural pool.

## Decision

1. **Single source of truth on the map**
  Structural integrity for mass encounters lives on `**HexTile.features`**: a discriminated union, persisted with the world (`peraspera-world`).
2. **Feature types (current scope)**
  - `**{ type: 'wall'; currentHp; maxHp }`** — one HP pool for the whole sector wall on that tile. There is **no** per-face / cardinal geometry; hostiles “pressure the wall” as a single meter.  
  - `**{ type: 'city_hall'; currentHp; maxHp }`** — civic last-stand structure on the relevant tile (Centro in the current seed).
3. **Where each feature is attached**
  - **Wall:** callers pass `**{ type: 'wall', hexId }`** in `**alliedStructures`** (nightly defense uses `daily.targetHexId`). The resolver applies wall damage to `hexMap.hexes[hexId]`.  
  - **City hall:** callers pass `**{ type: 'city_hall', hexId }`** (siege uses `CENTER_HEX_ID` today), aligned with the Prefeitura place slot on that tile. On bootstrap, if the `city_hall` feature is missing on Centro, it is **backfilled** from the Prefeitura slot’s `structureHp` when present (`ensureCityHallFeatureFromPrefeituraSlot` in `bootstrap.ts`).  
  - After damage to `city_hall`, `**syncPrefeituraSlotStructureHpFromCityHall`** keeps the prefeitura slot’s `structureHp` in line for legacy UI/raid code paths until a single-field cleanup is done. `**applyDamageToCityHallStructure(hexMap, cityHallHexId, damage)`** may target any hex with a `city_hall` feature.
4. **Default wall pool**
  `**DEFAULT_HEX_WALL_MAX_HP`** (400) is the default max for a newly ensured wall feature. It matches the old design of four 100-HP sections aggregated into one pool (see migration).
5. **Combat entry point (no separate “theater” enum)**
  Callers pass `**alliedStructures: AlliedStructure[]`** (discriminated `wall` | `city_hall` today; extensible) and optional `**sessionConfig`**, e.g. `**{ noRetreat: true }**`. If `noRetreat` is omitted, the default is `**true` when a `city_hall` structure is present** (last stand), else `**false`** (perimeter, retreat allowed). The structural role for the round is derived: `**city_hall` takes precedence** over `wall` if both appear (not used in the same turn today).  
   Rounds run through `**runEncounterCombatRound`** and `**advanceEncounterCombatRound`**, which require `**hexMap**` and a `**CombatRoundContinuation**` (turn, spirit, outcome/phase) — not a full `**DailyDefenseState**`; the session layer merges the returned `**stateDelta**` with `**applyEncounterCombatRoundToDaily**` (`**encounterCombatSessionMerge**`).
6. **Legacy `WallState` migration**
  - Old Zustand persist could still contain `state.wall.sections` under `peraspera-defense`.  
  - **Rule:** `currentHp` = sum of `section.current`, `maxHp` = sum of `section.max` over the four entries; clamp `currentHp` to `maxHp` if needed (`aggregateLegacyWallToPool` in `encounterCombatWall.ts`).  
  - The pool is written onto `**targetHexId`** from the co-located `dailyDefense` snapshot, then the `wall` key is removed from the stored JSON (`migrateLegacyDefenseWallIntoHexMap` in `bootstrap.ts`).
7. **Meta schema**
  Game meta `SCHEMA_VERSION` was bumped when save semantics changed; world hex features are carried in the world slice, not in a separate version field per tile.

## Consequences

**Positive**

- One pipeline (`encounterCombatRound`) + world mutation replaces dual stores for wall HP.  
- UI (theater HUD) reads `**hexMap`** + `targetHexId` / `CENTER_HEX_ID` consistently.  
- Union `HexTileFeature` can be extended later without breaking existing saves if migrations default `features` to `[]` / merge safely.

**Trade-offs / follow-ups**

- **Duplication:** `city_hall` vs `placeSlots[…].structureHp` — intentional short-term; converge on a single field when all readers use `features`.  
- **Migration:** one-off `localStorage` parse in bootstrap is practical but brittle if the defense persist format changes; consider a versioned `migrate` on the defense store later.  
- **Session config:** `EncounterSessionConfig` in `src/domain/types/encounter.ts` carries flags such as `noRetreat` alongside `alliedStructures` (replaces the old `nightly_wall` / `prefeitura_siege` switch).

## References (code)


| Area                                              | Location                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Allied structure + session types                  | `src/domain/types/encounter.ts`                                                      |
| Types                                             | `src/domain/types/map.ts`                                                            |
| Wall / city hall helpers & legacy aggregation     | `src/domain/encounterCombatWall.ts`                                                  |
| Round resolver                                    | `src/domain/encounterCombatRound.ts`                                                 |
| Public encounter API                              | `src/domain/encounterCombat.ts`                                                      |
| Session merge (combat delta into daily)           | `src/domain/encounterCombatSessionMerge.ts`                                          |
| Nightly / siege orchestration                     | `src/game/nightlyDefenseAdvance.ts`                                                  |
| Bootstrap: city hall, wall on target, legacy wall | `src/game/bootstrap.ts`                                                              |
| Defaults                                          | `src/domain/constants.ts` (`DEFAULT_HEX_WALL_MAX_HP`, `PREFECTURE_STRUCTURE_MAX_HP`) |
