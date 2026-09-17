# Agent status — perAspera

Living snapshot for new Cursor chats. Keep this short; product vision lives in `.cursor/rules/peraspera-vision.mdc`.

## Now

- Combat engine ADR + vertical slices 1–9 under `src/domain/combat/**` (`simulateBattle`, playback, skills, movement, retreat, role placement, AoE, scale).
- **Street skirmish reactivated** via the new engine: patrol roll → one-shot `simulateBattle` (1 character vs rust drone) → tick-tabbed playback UI. Win rewards: +4 score, +2 scrap. Speed = agility. Stepwise resume is future work.
- Nightly defense still uses legacy `encounterCombatRound` (`advanceNightlyDefenseRound`).
- Migration plan for nightly (phased R1 adapter / R2 tower-wall-spirit) remains open; street is the first product consumer of the engine.
- Slice 10 (Rails → Node microservice) is **out of scope** for now.

## Next

1. Optional polish: street encounter chance tooltip on hex hover; tuning drone threat by danger.
2. Nightly defense R1: adapter `DailyDefenseState` ↔ `BattleInput` / `BattleResult` + feature flag.
3. Presentation reuse: share tick-grouped playback patterns between street and nightly.
4. Lock nightly R1 decisions (`speed` defaults, `maxTicks`, one-sim vs resume).

## Key paths

| Area | Path |
| --- | --- |
| ADR | `docs/adr-combat-engine.md` |
| Engine entry | `src/domain/combat/core/simulate.ts` |
| Playback / tick groups | `src/domain/combat/io/playback.ts`, `groupByTick.ts` |
| Street skirmish | `src/domain/streetSkirmish.ts`, `src/domain/patrolEncounter.ts` |
| Skirmish store | `src/stores/useSkirmishStore.ts` |
| Nightly defense entry | `src/domain/nightlyDefenseCombat.ts` |
| Legacy round | `src/domain/encounterCombatRound.ts` |

## Commands

- `npm test` — Vitest
- `npm run dev` — Vite

## Do not do unless asked

- Force-push / amend history
- Slice 10 backend microservice wiring
- Full nightly encounter rewrite without the R1 adapter path
- Stepwise / resumable street combat (deferred)
