import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CENTER_HEX_ID,
  DEFENSE_LOCK_STA_COST,
  DEFENSE_START_HOUR,
  EMPTY_LOT_PRICE,
  NPC_OWNER_CITY,
  PATROL_STA_COST,
  STAMINA_REGEN_UI_INTERVAL_MS,
  STREET_SKIRMISH_WIN_CREDS,
  STREET_SKIRMISH_WIN_SCORE,
  WORK_STA_COST,
} from '../domain/constants.ts';
import {
  computeWorkPayout,
  hasCharacterBusinessOnHex,
  mergeItemGrants,
  type ItemGrant,
} from '../domain/businessPayout.ts';
import {
  formatEncounterChancePercent,
  rollPatrolEncounter,
} from '../domain/patrolEncounter.ts';
import {
  axialNeighbors,
  isAxialNeighbor,
  parseHexKey,
} from '../domain/hex.ts';
import { staminaVisualCurrentAt } from '../domain/stamina.ts';
import { makeBusinessId } from '../domain/ids.ts';
import type { BusinessKind } from '../domain/types/index.ts';
import type { CombatLogEntry } from '../domain/types/index.ts';
import type { Item } from '../domain/types/index.ts';
import {
  scoreEntriesFromCharacters,
  topScoreboard,
} from '../domain/leaderboard.ts';
import { defenseDemoPulseMessage } from '../content/combatLines.ts';
import {
  linkedScreenButtonLabel,
  placeSlotDisplayTitle,
  placeSlotLinkedScreen,
  placeSlotNpcBlurb,
} from '../content/npcPlaces.ts';
import {
  coreLoopBullets,
  GAME_TITLE,
  glossary,
  settingParagraphs,
  startPitchLines,
  startSublineParents,
} from '../content/lore.ts';
import { MARKET_CATALOG } from '../game/marketCatalog.ts';
import { applyStaminaRegenToAllCharacters } from '../game/staminaRegenTick.ts';
import { startNewGame } from '../game/startNewGame.ts';
import { syncGlobalScoreboardFromCharacters } from '../game/syncScoreboard.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useSkirmishStore } from '../stores/useSkirmishStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

import { CombatLogList } from './CombatLogList.tsx';
import { GameFabBar } from './GameFabBar.tsx';
import {
  GAME_FAB_ACTION_ITEMS,
  GAME_TOP_NAV_ITEMS,
  type GameScreen,
} from './gameNavigation.ts';
import { HexMapView } from './HexMapView.tsx';
import {
  fabActionItemsForHex,
  isScreenAvailableAtHex,
} from './screenHexAccess.ts';
import './game.css';

function useNowTick(ms: number): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return t;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function GameApp() {
  const [screen, setScreen] = useState<GameScreen>('map');
  const [newName, setNewName] = useState('');
  const [workFeedback, setWorkFeedback] = useState<string | null>(null);

  const skirmishSession = useSkirmishStore((s) => s.session);
  const startSkirmishFromPatrol = useSkirmishStore((s) => s.startFromPatrol);
  const advanceSkirmishRound = useSkirmishStore((s) => s.advanceRound);
  const dismissSkirmish = useSkirmishStore((s) => s.dismiss);

  const hexMap = useWorldStore((s) => s.hexMap);
  const characters = useCharactersStore((s) => s.characters);
  const currentId = useCharactersStore((s) => s.currentCharacterId);
  const setCurrentCharacterId = useCharactersStore(
    (s) => s.setCurrentCharacterId,
  );
  const updateCharacter = useCharactersStore((s) => s.updateCharacter);
  const addItem = useCharactersStore((s) => s.addItemToInventory);
  const removeItem = useCharactersStore((s) => s.removeItemFromInventory);
  const updateHex = useWorldStore((s) => s.updateHex);

  const dailyDefense = useDefenseStore((s) => s.dailyDefense);
  const wall = useDefenseStore((s) => s.wall);
  const patchDailyDefense = useDefenseStore((s) => s.patchDailyDefense);
  const patchNextIds = useMetaStore((s) => s.patchNextIds);

  const now = useNowTick(1000);
  const staminaUiTick = useNowTick(STAMINA_REGEN_UI_INTERVAL_MS);

  const topScores = useMemo(
    () => topScoreboard(scoreEntriesFromCharacters(characters), 10),
    [characters],
  );

  useEffect(() => {
    if (Object.keys(characters).length === 0) return;
    syncGlobalScoreboardFromCharacters(characters);
  }, [characters]);
  const purchaseSeq = useRef(0);

  const firstCharacterId = Object.keys(characters)[0] ?? null;

  useEffect(() => {
    if (firstCharacterId && !currentId) {
      setCurrentCharacterId(firstCharacterId);
    }
  }, [firstCharacterId, currentId, setCurrentCharacterId]);

  const activeId = currentId ?? firstCharacterId;
  const hasSave = hexMap !== null && firstCharacterId !== null;
  const character = activeId ? characters[activeId] : null;

  useEffect(() => {
    if (!hasSave) return;
    const id = window.setInterval(() => {
      applyStaminaRegenToAllCharacters(Date.now());
    }, STAMINA_REGEN_UI_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasSave]);

  const fabActionItems = useMemo(() => {
    if (!character) return [...GAME_FAB_ACTION_ITEMS];
    return fabActionItemsForHex(character.currentHexId, character.homeHexId);
  }, [character]);

  /** If the player leaves the hex, NPC screens fall back to Map without mutating last intent. */
  const resolvedScreen = useMemo((): GameScreen => {
    if (!character) return screen;
    if (
      isScreenAvailableAtHex(
        screen,
        character.currentHexId,
        character.homeHexId,
      )
    ) {
      return screen;
    }
    return 'map';
  }, [character, screen]);

  const sortedHexes = useMemo(() => {
    if (!hexMap) return [];
    return Object.values(hexMap.hexes).sort(
      (a, b) =>
        a.coordinates.r - b.coordinates.r ||
        a.coordinates.q - b.coordinates.q,
    );
  }, [hexMap]);

  const neighborIds = useMemo(() => {
    if (!character) return new Set<string>();
    const cur = parseHexKey(character.currentHexId);
    if (!cur) return new Set<string>();
    return new Set(
      axialNeighbors(cur.q, cur.r).map((c) => `${c.q},${c.r}`),
    );
  }, [character]);

  function patrolTo(targetHexId: string) {
    if (!character || !hexMap) return;
    const from = parseHexKey(character.currentHexId);
    const to = parseHexKey(targetHexId);
    if (!from || !to) return;
    if (!isAxialNeighbor(from, to)) return;
    const hex = hexMap.hexes[targetHexId];
    if (!hex?.isUnlocked) return;
    if (character.stamina.current < PATROL_STA_COST) return;
    const t = now;
    const destDanger = hex.danger;
    updateCharacter(character.id, {
      currentHexId: targetHexId,
      stamina: {
        ...character.stamina,
        current: character.stamina.current - PATROL_STA_COST,
        lastUpdated: t,
      },
    });
    if (
      rollPatrolEncounter({
        danger: destDanger,
        random: Math.random,
      })
    ) {
      startSkirmishFromPatrol({
        hexId: targetHexId,
        danger: destDanger,
        characterId: character.id,
        characterName: character.name,
      });
    }
  }

  function tryLockDefense() {
    if (!character) return;
    const dd = useDefenseStore.getState().dailyDefense;
    if (dd.isLocked[character.id]) return;
    if (character.stamina.current < DEFENSE_LOCK_STA_COST) return;
    const t = now;
    updateCharacter(character.id, {
      stamina: {
        ...character.stamina,
        current: character.stamina.current - DEFENSE_LOCK_STA_COST,
        lastUpdated: t,
      },
    });
    patchDailyDefense({
      isLocked: { ...dd.isLocked, [character.id]: true },
      lockedAt: { ...dd.lockedAt, [character.id]: t },
      enemies:
        dd.enemies.length === 0
          ? [
              {
                enemyId: 'drone_scout',
                currentHealth: 28,
                buffs: {},
              },
            ]
          : dd.enemies,
    });
  }

  function advanceDefenseTick() {
    const dd = useDefenseStore.getState().dailyDefense;
    const meta = useMetaStore.getState();
    const logNum = meta.nextIds.combatLogEntry + 1;
    const line: CombatLogEntry = {
      id: logNum,
      turn: dd.currentTurn + 1,
      timestamp: now,
      text: defenseDemoPulseMessage(dd.currentTurn + 1),
      type: 'system',
    };
    const nextEnemies = dd.enemies
      .map((e) => ({ ...e, currentHealth: e.currentHealth - 8 }))
      .filter((e) => e.currentHealth > 0);
    const waveCleared = dd.enemies.length > 0 && nextEnemies.length === 0;
    if (waveCleared && character) {
      const live = useCharactersStore.getState().characters[character.id];
      if (live) {
        updateCharacter(character.id, { score: live.score + 25 });
      }
    }
    patchNextIds({ combatLogEntry: logNum });
    patchDailyDefense({
      currentTurn: dd.currentTurn + 1,
      combatLog: [...dd.combatLog, line],
      enemies: nextEnemies,
      isCompleted: waveCleared,
    });
  }

  function buyCatalog(entry: (typeof MARKET_CATALOG)[number]) {
    if (!character) return;
    if (character.creds < entry.value) return;
    const item: Item = {
      id: `${entry.templateId}_${now}_${purchaseSeq.current++}`,
      name: entry.name,
      type: entry.type,
      rarity: entry.rarity,
      value: entry.value,
      effects: { ...entry.effects },
      quantity: 1,
    };
    updateCharacter(character.id, { creds: character.creds - entry.value });
    addItem(character.id, item);
  }

  function sellItem(item: Item) {
    if (!character || item.quantity < 1) return;
    const gain = item.value * item.quantity;
    removeItem(character.id, item.id);
    updateCharacter(character.id, { creds: character.creds + gain });
  }

  function buyEmptyLot(hexId: string, slotId: string) {
    if (!character || !hexMap) return;
    const hex = hexMap.hexes[hexId];
    const slot = hex?.placeSlots.find((p) => p.id === slotId);
    if (!slot || slot.type !== 'empty' || slot.ownedBy !== NPC_OWNER_CITY)
      return;
    if (character.creds < slot.priceToBuy) return;
    updateCharacter(character.id, {
      creds: character.creds - slot.priceToBuy,
    });
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) =>
        p.id === slotId
          ? { ...p, ownedBy: character.id, priceToBuy: 0 }
          : p,
      ),
    }));
  }

  function establishBusiness(
    hexId: string,
    slotId: string,
    kind: BusinessKind,
  ) {
    if (!character) return;
    const meta = useMetaStore.getState();
    const bizNum = meta.nextIds.business + 1;
    const bizId = makeBusinessId(bizNum);
    patchNextIds({ business: bizNum });
    const labels: Record<BusinessKind, string> = {
      loja: 'Corner Shop',
      industria: 'Chip Foundry',
      fazenda: 'Neon Farm',
      outro: 'Venue',
    };
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.ownedBy !== character.id) return p;
        const business = {
          id: bizId,
          name: labels[kind],
          type: kind,
          level: 1,
          productionRate: 12,
          lastProduction: now,
        };
        return { ...p, type: 'business' as const, business };
      }),
    }));
  }

  function workBusinesses() {
    if (!character) return;
    if (character.stamina.current < WORK_STA_COST) return;
    const map = useWorldStore.getState().hexMap;
    if (!map) return;
    const hex = map.hexes[character.currentHexId];
    if (!hasCharacterBusinessOnHex(hex, character.id)) {
      setWorkFeedback('Stand on a hex with your business to work.');
      return;
    }
    const t = now;

    let totalCreds = 0;
    const rawGrants: ItemGrant[] = [];

    const newSlots = hex.placeSlots.map((p) => {
      if (
        p.type !== 'business' ||
        !p.business ||
        p.ownedBy !== character.id
      ) {
        return p;
      }
      const y = computeWorkPayout(p.business);
      totalCreds += y.creds;
      rawGrants.push(...y.itemGrants);
      return {
        ...p,
        business: { ...p.business, lastProduction: t },
      };
    });

    updateHex(character.currentHexId, (h) => ({ ...h, placeSlots: newSlots }));

    const merged = mergeItemGrants(rawGrants);
    let seq = purchaseSeq.current;
    for (const g of merged) {
      const item: Item = {
        id: `${g.templateId}_${t}_${seq++}`,
        name: g.name,
        type: g.type,
        rarity: g.rarity,
        value: g.value,
        effects: { ...g.effects },
        quantity: g.quantity,
      };
      addItem(character.id, item);
    }
    purchaseSeq.current = seq;

    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return;

    updateCharacter(character.id, {
      creds: live.creds + totalCreds,
      stamina: {
        ...live.stamina,
        current: live.stamina.current - WORK_STA_COST,
        lastUpdated: t,
      },
    });

    const parts: string[] = [];
    if (totalCreds > 0) parts.push(`+${totalCreds} creds`);
    if (merged.length > 0) {
      parts.push(
        merged.map((g) => `+${g.quantity}× ${g.name}`).join(', '),
      );
    }
    setWorkFeedback(
      parts.length > 0 ? parts.join(' · ') : `Paid ${WORK_STA_COST} STA (no payout).`,
    );
  }

  if (!hasSave || !character || !hexMap) {
    return (
      <div className="game-start">
        <h1>{GAME_TITLE}</h1>
        <p className="game-tagline">{startPitchLines[0]}</p>
        {startPitchLines.length > 1 ? (
          <p className="game-muted">{startPitchLines[1]}</p>
        ) : null}
        <p className="game-muted game-start-flavor">{startSublineParents}</p>
        <p className="game-muted">Alpha 0.1 — local save only</p>
        <label htmlFor="char-name">Character name</label>
        <input
          id="char-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            startNewGame(newName);
            setNewName('');
          }}
        >
          Start
        </button>
      </div>
    );
  }

  const currentHex = hexMap.hexes[character.currentHexId];
  const slotsHere = currentHex?.placeSlots ?? [];
  const canWorkOnCurrentHex = hasCharacterBusinessOnHex(
    currentHex,
    character.id,
  );
  const atCenter = character.currentHexId === CENTER_HEX_ID;
  const atHome = character.currentHexId === character.homeHexId;

  return (
    <div className="game-shell game-shell--with-fab">
      <header className="game-header">
        <div>
          <h1>{character.name}</h1>
          <p className="game-muted">
            Lv {character.level} · {character.creds} creds
          </p>
        </div>
        <div className="game-stat">
          STA{' '}
          {Math.floor(staminaVisualCurrentAt(character.stamina, staminaUiTick))}/
          {character.stamina.max}
        </div>
      </header>

      <nav className="game-nav" aria-label="Main navigation">
        {GAME_TOP_NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-active={resolvedScreen === id}
            onClick={() => setScreen(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {resolvedScreen === 'map' && (
        <section className="game-panel">
          <h2>Hex map</h2>
          <p className="game-muted">
            You are at <strong>{character.currentHexId}</strong>. Neighbors
            cost {PATROL_STA_COST} STA. Entering a hex may trigger a street
            encounter; higher <strong>dng</strong> raises the chance (approx %
            per hex).
          </p>
          <p className="game-muted game-map-npc">
            <strong>Centro</strong> ({CENTER_HEX_ID}): Mercado Municipal,
            Prefeitura, Quartel General. <strong>Home</strong> (
            {character.homeHexId}): parents&apos; place &amp; Velho Rabiscão.
          </p>
          <HexMapView
            hexes={sortedHexes}
            currentHexId={character.currentHexId}
            homeHexId={character.homeHexId}
            centerHexId={CENTER_HEX_ID}
            neighborIds={neighborIds}
            patrolStaCost={PATROL_STA_COST}
            staminaCurrent={character.stamina.current}
            encounterPctLabel={formatEncounterChancePercent}
            onPatrolTo={patrolTo}
          />
        </section>
      )}

      {resolvedScreen === 'profile' && (
        <section className="game-panel">
          <h2>Profile</h2>
          <p>EXP {character.exp}</p>
          <p>Score (defense) {character.score}</p>
          <p>Reputation {character.reputation}</p>
          <p>Home {character.homeHexId}</p>
        </section>
      )}

      {resolvedScreen === 'inventory' && (
        <section className="game-panel">
          <h2>Inventory</h2>
          {character.inventory.length === 0 ? (
            <p className="game-muted">Empty</p>
          ) : (
            <ul>
              {character.inventory.map((it) => (
                <li key={it.id}>
                  {it.name} ×{it.quantity} ({it.value}c)
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {resolvedScreen === 'market' && (
        <section className="game-panel">
          <h2>Municipal market</h2>
          {!atCenter ? (
            <p className="game-muted">
              The market is at <strong>Centro</strong> ({CENTER_HEX_ID}). You
              are at <strong>{character.currentHexId}</strong> — patrol there to
              buy or sell.
            </p>
          ) : (
            <>
          <p className="game-muted">
            You are at the <strong>Mercado Municipal</strong> stall — same
            Centro hex as Prefeitura and Quartel General.
          </p>
          <table className="game-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {MARKET_CATALOG.map((row) => (
                <tr key={row.templateId}>
                  <td>{row.name}</td>
                  <td>{row.value}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => buyCatalog(row)}
                      disabled={character.creds < row.value}
                    >
                      Buy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Sell from inventory</h3>
          {character.inventory.length === 0 ? (
            <p className="game-muted">Nothing to sell</p>
          ) : (
            <ul>
              {character.inventory.map((it) => (
                <li key={it.id}>
                  {it.name}{' '}
                  <button type="button" onClick={() => sellItem(it)}>
                    Sell (+{it.value * it.quantity})
                  </button>
                </li>
              ))}
            </ul>
          )}
            </>
          )}
        </section>
      )}

      {resolvedScreen === 'defense' && (
        <section className="game-panel">
          <h2>Nightly defense</h2>
          {!atCenter ? (
            <p className="game-muted">
              Enlist at the <strong>Quartel General</strong> in{' '}
              <strong>Centro</strong> ({CENTER_HEX_ID}). You are at{' '}
              <strong>{character.currentHexId}</strong>
              {' '}
              — open{' '}
              <button
                type="button"
                className="game-inline-nav"
                onClick={() => setScreen('map')}
              >
                Map
              </button>{' '}
              in the top bar, patrol to <strong>Centro</strong>, then use{' '}
              <strong>Defense</strong> in the action bar below.
            </p>
          ) : (
            <>
          <p className="game-muted">
            You are at the <strong>Quartel General</strong> — enlist for the
            nightly defense below.
          </p>
          <p>
            Local time <strong>{formatTime(new Date(now))}</strong> · event
            hour {DEFENSE_START_HOUR}:00
          </p>
          <p className="game-muted">
            Day {dailyDefense.date} · game day index {dailyDefense.gameDayIndex}{' '}
            · locked:{' '}
            {dailyDefense.isLocked[character.id] ? 'yes' : 'no'}
          </p>
          <button
            type="button"
            onClick={tryLockDefense}
            disabled={
              dailyDefense.isLocked[character.id] ||
              character.stamina.current < DEFENSE_LOCK_STA_COST
            }
          >
            Lock ({DEFENSE_LOCK_STA_COST} STA)
          </button>
          <button type="button" onClick={advanceDefenseTick}>
            Advance tick (demo)
          </button>
          <h3>Wall</h3>
          {(Object.keys(wall.sections) as (keyof typeof wall.sections)[]).map(
            (side) => (
              <div key={side} className="game-wall-bar">
                {side}:{' '}
                <meter
                  value={wall.sections[side].current}
                  min={0}
                  max={wall.sections[side].max}
                />{' '}
                {Math.round(wall.sections[side].current)}/
                {wall.sections[side].max}
                {wall.sections[side].breached ? ' (breached)' : ''}
              </div>
            ),
          )}
          <h3>Combat log</h3>
          <CombatLogList entries={dailyDefense.combatLog} />
            </>
          )}
        </section>
      )}

      {resolvedScreen === 'lore' && (
        <section className="game-panel game-lore" aria-labelledby="lore-heading">
          <h2 id="lore-heading">City &amp; canon</h2>
          {settingParagraphs.map((p, i) => (
            <p key={i} className="game-lore-prose">
              {p}
            </p>
          ))}
          <h3>Core loop</h3>
          <ul className="game-lore-list">
            {coreLoopBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <h3>Glossary</h3>
          <dl className="game-lore-glossary">
            {glossary.map(({ term, description }) => (
              <div key={term} className="game-lore-glossary-row">
                <dt>{term}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {resolvedScreen === 'leaderboard' && (
        <section className="game-panel">
          <h2>Local scoreboard (Top 10)</h2>
          {!atHome ? (
            <p className="game-muted">
              <strong>Velho Rabiscão</strong> keeps the list at your home hex (
              {character.homeHexId}). You are at{' '}
              <strong>{character.currentHexId}</strong>
              {' '}
              — open{' '}
              <button
                type="button"
                className="game-inline-nav"
                onClick={() => setScreen('map')}
              >
                Map
              </button>{' '}
              in the top bar, patrol home, then use <strong>Scores</strong> in
              the action bar below.
            </p>
          ) : (
            <>
          <p className="game-muted">
            <strong>Velho Rabiscão</strong> reads the Top 10 from his scraps —
            you are home.
          </p>
          <p className="game-muted">
            Sorted by defense score, then recency. Stored with your save.
          </p>
          {topScores.length === 0 ? (
            <p className="game-muted">No entries yet.</p>
          ) : (
            <table className="game-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {topScores.map((row, i) => (
                  <tr key={row.characterId}>
                    <td>{i + 1}</td>
                    <td>
                      {row.name}
                      {row.characterId === character.id ? ' (you)' : ''}
                    </td>
                    <td>{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
            </>
          )}
        </section>
      )}

      {resolvedScreen === 'lots' && (
        <section className="game-panel">
          <h2>Lots @ {character.currentHexId}</h2>
          {canWorkOnCurrentHex ? (
            <div className="game-work-here">
              <p className="game-muted">
                Work applies to <strong>your businesses on this hex only</strong>{' '}
                ({WORK_STA_COST} STA — creds + items by business type).
              </p>
              <button
                type="button"
                onClick={workBusinesses}
                disabled={character.stamina.current < WORK_STA_COST}
              >
                Work ({WORK_STA_COST} STA)
              </button>
              {workFeedback ? (
                <p className="game-work-feedback" role="status">
                  {workFeedback}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="game-muted">
              <strong>Work</strong> is available when you stand on a hex that
              has a business you own — open Lots there after building on an
              empty lot.
            </p>
          )}
          {slotsHere.length === 0 ? (
            <p className="game-muted">No slots here</p>
          ) : (
            <ul className="game-slot-list">
              {slotsHere.map((slot) => {
                const slotTitle = placeSlotDisplayTitle(slot);
                const slotBlurb = placeSlotNpcBlurb(slot);
                const slotLink = placeSlotLinkedScreen(slot);
                return (
                <li key={slot.id} className="game-slot-row">
                  <div className="game-slot-head">
                    <strong>{slotTitle}</strong>
                    <span className="game-muted"> · {slot.id}</span>
                    {slotBlurb ? (
                      <p className="game-muted game-slot-blurb">{slotBlurb}</p>
                    ) : null}
                    {slotLink ? (
                      <button
                        type="button"
                        className="game-slot-nav"
                        onClick={() => setScreen(slotLink)}
                      >
                        {linkedScreenButtonLabel(slotLink)}
                      </button>
                    ) : null}
                  </div>
                  {slot.type === 'empty' && slot.ownedBy === NPC_OWNER_CITY && (
                    <>
                      {' '}
                      — {EMPTY_LOT_PRICE}c{' '}
                      <button
                        type="button"
                        onClick={() =>
                          buyEmptyLot(character.currentHexId, slot.id)
                        }
                        disabled={character.creds < slot.priceToBuy}
                      >
                        Buy lot
                      </button>
                    </>
                  )}
                  {slot.type === 'empty' &&
                    slot.ownedBy === character.id &&
                    !slot.business && (
                      <span>
                        {' '}
                        Owned — build:{' '}
                        {(['loja', 'industria', 'fazenda'] as const).map(
                          (k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() =>
                                establishBusiness(
                                  character.currentHexId,
                                  slot.id,
                                  k,
                                )
                              }
                            >
                              {k}
                            </button>
                          ),
                        )}
                      </span>
                    )}
                  {slot.type === 'business' && slot.business && (
                    <span className="game-muted">
                      {' '}
                      — {slot.business.name} (Lv {slot.business.level},{' '}
                      +{slot.business.productionRate}/day)
                    </span>
                  )}
                </li>
              );
              })}
            </ul>
          )}
          <p className="game-muted">
            Empty lots appear on ring hexes (not Centro or your home hex). Move
            on the map to buy.
          </p>
        </section>
      )}

      {skirmishSession ? (
        <div
          className="game-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skirmish-title"
        >
          <div className="game-modal">
            <h2 id="skirmish-title">Street fight</h2>
            <p className="game-muted">
              Hex {skirmishSession.hexId} · danger{' '}
              {Math.round(skirmishSession.danger)} ·{' '}
              {skirmishSession.characterName}
            </p>
            <p>
              Your HP {skirmishSession.playerHealth}/
              {skirmishSession.playerMaxHealth}
            </p>
            {skirmishSession.enemies.length > 0 ? (
              <ul className="game-skirmish-enemies">
                {skirmishSession.enemies.map((e, i) => (
                  <li key={`${e.enemyId}-${i}`}>
                    {e.enemyId} — {e.currentHealth} HP
                  </li>
                ))}
              </ul>
            ) : (
              <p className="game-muted">No hostiles left.</p>
            )}
            <h3>Log</h3>
            <CombatLogList
              entries={skirmishSession.combatLog}
              className="game-combat-log--skirmish"
            />
            {skirmishSession.isCompleted ? (
              <>
                {skirmishSession.outcome === 'win' ? (
                  <p className="game-skirmish-result">
                    Victory — +{STREET_SKIRMISH_WIN_CREDS} creds, +
                    {STREET_SKIRMISH_WIN_SCORE} score (already applied).
                  </p>
                ) : (
                  <p className="game-skirmish-result">
                    You went down. Heal up and keep patrolling.
                  </p>
                )}
                <button type="button" onClick={() => dismissSkirmish()}>
                  Close
                </button>
              </>
            ) : (
              <button type="button" onClick={() => advanceSkirmishRound()}>
                Act (round)
              </button>
            )}
          </div>
        </div>
      ) : null}

      <GameFabBar
        activeScreen={resolvedScreen}
        onSelect={setScreen}
        items={fabActionItems}
      />
    </div>
  );
}
