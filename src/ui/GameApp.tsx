import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFENSE_LOCK_STA_COST,
  DEFENSE_START_HOUR,
  EMPTY_LOT_PRICE,
  NPC_OWNER_CITY,
  PATROL_STA_COST,
  WORK_STA_COST,
} from '../domain/constants.ts';
import {
  axialNeighbors,
  isAxialNeighbor,
  parseHexKey,
} from '../domain/hex.ts';
import { makeBusinessId } from '../domain/ids.ts';
import type { BusinessKind } from '../domain/types/index.ts';
import type { CombatLogEntry } from '../domain/types/index.ts';
import type { Item } from '../domain/types/index.ts';
import {
  scoreEntriesFromCharacters,
  topScoreboard,
} from '../domain/leaderboard.ts';
import {
  coreLoopBullets,
  GAME_TITLE,
  glossary,
  settingParagraphs,
  startPitchLines,
  startSublineParents,
} from '../content/lore.ts';
import { MARKET_CATALOG } from '../game/marketCatalog.ts';
import { startNewGame } from '../game/startNewGame.ts';
import { syncGlobalScoreboardFromCharacters } from '../game/syncScoreboard.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

import './game.css';

type Screen =
  | 'map'
  | 'profile'
  | 'market'
  | 'defense'
  | 'lots'
  | 'leaderboard'
  | 'lore';

const SCREEN_NAV: readonly {
  id: Screen;
  label: string;
  fab: string;
}[] = [
  { id: 'map', label: 'Map', fab: 'Map' },
  { id: 'profile', label: 'Profile', fab: 'Me' },
  { id: 'market', label: 'Market', fab: '$' },
  { id: 'defense', label: 'Defense', fab: 'Def' },
  { id: 'lots', label: 'Lots', fab: 'Lot' },
  { id: 'leaderboard', label: 'Scores', fab: 'Top' },
  { id: 'lore', label: 'Lore', fab: 'Lore' },
] as const;

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
  const [screen, setScreen] = useState<Screen>('map');
  const [newName, setNewName] = useState('');

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
    updateCharacter(character.id, {
      currentHexId: targetHexId,
      stamina: {
        ...character.stamina,
        current: character.stamina.current - PATROL_STA_COST,
        lastUpdated: t,
      },
    });
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
      text: `Tick ${dd.currentTurn + 1}: city pulse — wall holds.`,
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
    const t = now;
    let touched = false;
    for (const hex of Object.values(map.hexes)) {
      const hasMine = hex.placeSlots.some(
        (s) =>
          s.type === 'business' &&
          s.business &&
          s.ownedBy === character.id,
      );
      if (!hasMine) continue;
      touched = true;
      updateHex(hex.id, (h) => ({
        ...h,
        placeSlots: h.placeSlots.map((p) =>
          p.type === 'business' &&
          p.business &&
          p.ownedBy === character.id
            ? { ...p, business: { ...p.business, lastProduction: t } }
            : p,
        ),
      }));
    }
    if (!touched) return;
    updateCharacter(character.id, {
      stamina: {
        ...character.stamina,
        current: character.stamina.current - WORK_STA_COST,
        lastUpdated: t,
      },
    });
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
          STA {character.stamina.current}/{character.stamina.max}
        </div>
      </header>

      <nav className="game-nav" aria-label="Screens">
        {SCREEN_NAV.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-active={screen === id}
            onClick={() => setScreen(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {screen === 'map' && (
        <section className="game-panel">
          <h2>Hex map</h2>
          <p className="game-muted">
            You are at <strong>{character.currentHexId}</strong>. Neighbors
            cost {PATROL_STA_COST} STA.
          </p>
          <div className="game-hex-grid">
            {sortedHexes.map((h) => {
              const isCurrent = h.id === character.currentHexId;
              const isNb = neighborIds.has(h.id) && !isCurrent;
              const canPatrol =
                isNb && h.isUnlocked && character.stamina.current >= PATROL_STA_COST;
              return (
                <button
                  key={h.id}
                  type="button"
                  className="game-hex"
                  data-current={isCurrent}
                  data-neighbor={canPatrol}
                  data-locked={!h.isUnlocked}
                  disabled={!canPatrol}
                  onClick={() => canPatrol && patrolTo(h.id)}
                >
                  <div>
                    <strong>{h.id}</strong>
                  </div>
                  <div>dng {Math.round(h.danger)}</div>
                  <div>int {Math.round(h.integrity)}</div>
                  {!h.isUnlocked && <div className="game-muted">locked</div>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {screen === 'profile' && (
        <section className="game-panel">
          <h2>Profile</h2>
          <p>EXP {character.exp}</p>
          <p>Score (defense) {character.score}</p>
          <p>Reputation {character.reputation}</p>
          <p>Home {character.homeHexId}</p>
          <h3>Inventory</h3>
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
          <h3>Work (businesses)</h3>
          <p className="game-muted">
            Spend {WORK_STA_COST} STA to refresh production timestamps on your
            businesses.
          </p>
          <button type="button" onClick={workBusinesses}>
            Work ({WORK_STA_COST} STA)
          </button>
        </section>
      )}

      {screen === 'market' && (
        <section className="game-panel">
          <h2>Municipal market</h2>
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
        </section>
      )}

      {screen === 'defense' && (
        <section className="game-panel">
          <h2>Nightly defense</h2>
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
          <pre className="game-log">
            {dailyDefense.combatLog.length === 0
              ? '—'
              : dailyDefense.combatLog
                  .map((l) => `[${l.type}] ${l.text}`)
                  .join('\n')}
          </pre>
        </section>
      )}

      {screen === 'lore' && (
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

      {screen === 'leaderboard' && (
        <section className="game-panel">
          <h2>Local scoreboard (Top 10)</h2>
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
        </section>
      )}

      {screen === 'lots' && (
        <section className="game-panel">
          <h2>Lots @ {character.currentHexId}</h2>
          {slotsHere.length === 0 ? (
            <p className="game-muted">No slots here</p>
          ) : (
            <ul>
              {slotsHere.map((slot) => (
                <li key={slot.id}>
                  <strong>{slot.type}</strong> · {slot.id}
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
              ))}
            </ul>
          )}
          <p className="game-muted">
            Empty city lots are on ring hexes (not center). Move on the map to
            buy.
          </p>
        </section>
      )}

      <div
        className="game-fab"
        role="toolbar"
        aria-label="Quick navigation"
      >
        {SCREEN_NAV.map(({ id, fab, label }) => (
          <button
            key={id}
            type="button"
            className="game-fab-btn"
            data-active={screen === id}
            aria-label={label}
            onClick={() => setScreen(id)}
          >
            {fab}
          </button>
        ))}
      </div>
    </div>
  );
}
