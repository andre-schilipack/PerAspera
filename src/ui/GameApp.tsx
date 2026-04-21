import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ALLY_SPIRIT_INITIAL,
  ALLY_SPIRIT_MAX,
  CENTER_HEX_ID,
  COMBAT_UI_LOG_LINE_MS,
  COMBAT_UI_ROUND_INTERVAL_MS,
  DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
  DEFENSE_LOCK_STA_COST,
  DEFENSE_START_HOUR,
  ECONOMIC_TICK_INTERVAL_MS,
  EMPTY_LOT_PRICE,
  INITIAL_CIVILIAN_POPULATION,
  NPC_OWNER_CITY,
  PATROL_STA_COST,
  STAMINA_REGEN_UI_INTERVAL_MS,
  STREET_SKIRMISH_SCRAP_REWARD_QTY,
  STREET_SKIRMISH_WIN_SCORE,
  WALL_REPAIR_CREDS_COST,
  WALL_REPAIR_INTEGRITY_PER_ACTION,
  WORK_STA_COST,
} from '../domain/constants.ts';
import {
  normalizeBusiness,
  totalAssignedWorkersAcrossMap,
  workerPoolAvailable,
} from '../domain/businessEconomyTick.ts';
import { claimFromBusinessBuffers } from '../domain/businessClaim.ts';
import { createNewBusiness } from '../domain/factories/createBusiness.ts';
import { formatLocalDateString } from '../domain/defenseSchedule.ts';
import {
  displayEconomicDecreasing,
  displayEconomicIncreasing,
} from '../domain/economicDisplay.ts';
import { repairWallSection as applyWallIntegrityRepair } from '../domain/wallIntegrity.ts';
import {
  computeWorkPayout,
  hasCharacterBusinessOnHex,
  itemGrantTemplate,
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
import { healthVisualCurrentAt } from '../domain/healthRegen.ts';
import { staminaVisualCurrentAt } from '../domain/stamina.ts';
import { makeBusinessId } from '../domain/ids.ts';
import type {
  BusinessKind,
  IndustrialRecipeId,
  NightlyDefenseOutcome,
  WallCardinal,
} from '../domain/types/index.ts';
import type { Item } from '../domain/types/index.ts';
import {
  scoreEntriesFromCharacters,
  topScoreboard,
} from '../domain/leaderboard.ts';
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
import {
  depositIntoBusinessSlots,
  withdrawFromBusinessSlotAt,
} from '../domain/businessInventorySlots.ts';
import {
  describeUseConsumableFailure,
  inferTemplateIdFromItem,
  isDailyConsumableOnCooldown,
  resolveMarketEntryForItem,
  tryUseConsumable,
} from '../domain/consumableUse.ts';
import type { MarketCatalogEntry } from '../domain/marketCatalog.ts';
import { getMarketCatalogEntry, MARKET_CATALOG } from '../domain/marketCatalog.ts';
import { addCharacterToWorld } from '../game/addCharacterToWorld.ts';
import { applyHealthRegenToAllCharacters } from '../game/healthRegenTick.ts';
import { applyStaminaRegenToAllCharacters } from '../game/staminaRegenTick.ts';
import {
  enlistInExpansionContract,
  ensureExpansionContract,
} from '../game/expansionContracts.ts';
import { playCombatStartSound } from '../audio/playCombatStartSound.ts';
import { applyAutoEnlistLocksForDefense } from '../game/applyAutoEnlistLocksForDefense.ts';
import { countLivingInBucket } from '../domain/defenseTactics.ts';
import { buildDefenderLineFromLocks } from '../domain/nightlyDefenseCombat.ts';
import { runEconomicCatchUp } from '../game/economicCatchUp.ts';
import { startNewGame } from '../game/startNewGame.ts';
import { syncGlobalScoreboardFromCharacters } from '../game/syncScoreboard.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useSkirmishStore } from '../stores/useSkirmishStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

import { CombatLogList } from './CombatLogList.tsx';
import { CombatModal } from './CombatModal.tsx';
import { useCombatLogReveal } from './useCombatLogReveal.ts';
import { GameFabBar } from './GameFabBar.tsx';
import { GameOverOverlay } from './GameOverOverlay.tsx';
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

function defenseCatchUpOutcomeLabel(o: NightlyDefenseOutcome): string {
  switch (o) {
    case 'victory':
      return 'Vitória';
    case 'breach':
      return 'Brecha';
    case 'prefeitura_siege':
      return 'Cerco à Prefeitura (transitório)';
    case 'loss':
      return 'Derrota — Prefeitura';
    case 'active':
      return 'Activo';
    default:
      return o;
  }
}

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

/** Short subtitle for inventory rows (gear stats, tools, cooldown hints use separate UI). */
function catalogItemSubtitle(entry: MarketCatalogEntry | undefined): string {
  if (!entry) return '';
  const fx = entry.effects;
  const bits: string[] = [];
  if (fx.minLevel != null && fx.minLevel > 0) {
    bits.push(`nível ≥ ${String(fx.minLevel)}`);
  }
  if (fx.attackBonus != null && fx.attackBonus > 0) {
    bits.push(`+${String(fx.attackBonus)} ataque`);
  }
  if (fx.damageBonus != null && fx.damageBonus > 0) {
    bits.push(`+${String(fx.damageBonus)} dano`);
  }
  if (fx.defenseBonus != null && fx.defenseBonus > 0) {
    bits.push(`+${String(fx.defenseBonus)} defesa`);
  }
  if (fx.mobileCarrySlots != null && fx.mobileCarrySlots > 0) {
    bits.push(`transporte ×${String(fx.mobileCarrySlots)}`);
  }
  if (fx.futureMining != null && fx.futureMining > 0) {
    bits.push('mineração (breve)');
  }
  return bits.join(' · ');
}

export default function GameApp() {
  const [screen, setScreen] = useState<GameScreen>('map');
  const [newName, setNewName] = useState('');
  const [selectionNewName, setSelectionNewName] = useState('');
  const [addCharacterError, setAddCharacterError] = useState<string | null>(
    null,
  );
  const [workFeedback, setWorkFeedback] = useState<string | null>(null);
  const [expansionEnsureHint, setExpansionEnsureHint] = useState<string | null>(
    null,
  );
  const [expansionEnlistFeedback, setExpansionEnlistFeedback] = useState<
    string | null
  >(null);
  const [inventoryUseFeedback, setInventoryUseFeedback] = useState<
    string | null
  >(null);

  const skirmishSession = useSkirmishStore((s) => s.session);
  const startSkirmishFromPatrol = useSkirmishStore((s) => s.startFromPatrol);
  const dismissSkirmish = useSkirmishStore((s) => s.dismiss);
  const markSkirmishConsumableUsed = useSkirmishStore(
    (s) => s.markSkirmishConsumableUsed,
  );

  const hexMap = useWorldStore((s) => s.hexMap);
  const characters = useCharactersStore((s) => s.characters);
  const currentId = useCharactersStore((s) => s.currentCharacterId);
  const setCurrentCharacterId = useCharactersStore(
    (s) => s.setCurrentCharacterId,
  );
  const updateCharacter = useCharactersStore((s) => s.updateCharacter);
  const addItem = useCharactersStore((s) => s.addItemToInventory);
  const removeItem = useCharactersStore((s) => s.removeItemFromInventory);
  const consumeOneUnitFromInventory = useCharactersStore(
    (s) => s.consumeOneUnitFromInventory,
  );
  const consumeQuantityFromInventory = useCharactersStore(
    (s) => s.consumeQuantityFromInventory,
  );
  const updateHex = useWorldStore((s) => s.updateHex);

  const dailyDefense = useDefenseStore((s) => s.dailyDefense);
  const wall = useDefenseStore((s) => s.wall);
  const setWall = useDefenseStore((s) => s.setWall);
  const patchDailyDefense = useDefenseStore((s) => s.patchDailyDefense);
  const advanceNightlyDefenseRound = useDefenseStore(
    (s) => s.advanceNightlyDefenseRound,
  );
  const defenseEndScreen = useDefenseStore((s) => s.defenseEndScreen);
  const dismissDefenseEndScreen = useDefenseStore(
    (s) => s.dismissDefenseEndScreen,
  );
  const defenseCatchUpSummary = useDefenseStore(
    (s) => s.defenseCatchUpSummary,
  );
  const dismissDefenseCatchUpSummary = useDefenseStore(
    (s) => s.dismissDefenseCatchUpSummary,
  );
  const cityCore = useCityStore((s) => s.cityCore);
  const civilianPopulation = useCityStore(
    (s) => s.civilianPopulation ?? INITIAL_CIVILIAN_POPULATION,
  );
  const patchNextIds = useMetaStore((s) => s.patchNextIds);
  const gameOver = useMetaStore((s) => s.gameOver);
  const gameOverReason = useMetaStore((s) => s.gameOverReason);
  const gameOverAt = useMetaStore((s) => s.gameOverAt);
  const contracts = useContractsStore((s) => s.contracts);

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
  /** Prevents duplicate auto-start on the same calendar day. */
  const autoNightlyDefenseDateRef = useRef<string | null>(null);

  const characterIds = Object.keys(characters);
  const needsFirstRun = !hexMap || characterIds.length === 0;
  const activeCharacterValid =
    currentId != null && characters[currentId] !== undefined;
  const needsSelection =
    hexMap != null && characterIds.length > 0 && !activeCharacterValid;
  const inGame = hexMap != null && activeCharacterValid;
  const character =
    inGame && currentId !== null ? characters[currentId] : null;

  const [defenseCombatDismissed, setDefenseCombatDismissed] = useState(false);

  useEffect(() => {
    setDefenseCombatDismissed(false);
  }, [dailyDefense.date]);

  const skirmishRevealKey = skirmishSession
    ? `sk-${skirmishSession.characterId}-${skirmishSession.hexId}-${String(skirmishSession.combatLog[0]?.id ?? 0)}`
    : 'sk-idle';

  const skirmishReveal = useCombatLogReveal(
    skirmishSession?.combatLog ?? [],
    skirmishRevealKey,
    COMBAT_UI_LOG_LINE_MS,
  );

  const showDefenseCombatModal =
    inGame &&
    (dailyDefense.phase === 'preparing' ||
      dailyDefense.phase === 'fighting' ||
      (dailyDefense.phase === 'ended' &&
        dailyDefense.isCompleted &&
        !defenseCombatDismissed));

  const defenseCombatSessionKey = `${dailyDefense.date}-${String(dailyDefense.gameDayIndex)}-${showDefenseCombatModal ? 'open' : 'idle'}`;

  const defenseReveal = useCombatLogReveal(
    showDefenseCombatModal ? dailyDefense.combatLog : [],
    defenseCombatSessionKey,
    COMBAT_UI_LOG_LINE_MS,
  );

  useEffect(() => {
    if (!inGame || gameOver) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      applyStaminaRegenToAllCharacters(t);
      applyHealthRegenToAllCharacters(t);
    }, STAMINA_REGEN_UI_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [inGame, gameOver]);

  useEffect(() => {
    if (!inGame || gameOver) return;
    const id = window.setInterval(() => {
      runEconomicCatchUp(Date.now());
    }, ECONOMIC_TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [inGame, gameOver]);

  /** Street skirmish: drum sting, then after 5s start fighting + first round; then every 3s. */
  useEffect(() => {
    if (!skirmishSession || skirmishSession.phase !== 'preparing') return;
    playCombatStartSound();
    const prepTimer = window.setTimeout(() => {
      const store = useSkirmishStore.getState();
      store.setPhase('fighting');
      store.advanceRound();
    }, 5000);
    return () => window.clearTimeout(prepTimer);
    // Intentionally omit skirmishSession: combatLog/HP updates must not restart the 5s prep timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- session identity via hexId + characterId + phase
  }, [skirmishSession?.phase, skirmishSession?.characterId, skirmishSession?.hexId]);

  useEffect(() => {
    if (
      !skirmishSession ||
      skirmishSession.phase !== 'fighting' ||
      skirmishSession.isCompleted
    ) {
      return;
    }
    const intervalId = window.setInterval(() => {
      useSkirmishStore.getState().advanceRound();
      const s = useSkirmishStore.getState().session;
      if (!s || s.isCompleted) {
        window.clearInterval(intervalId);
      }
    }, COMBAT_UI_ROUND_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- log/HP churn must not reset the round interval
  }, [
    skirmishSession?.phase,
    skirmishSession?.isCompleted,
    skirmishSession?.characterId,
  ]);

  function beginNightlyDefense() {
    const dd = useDefenseStore.getState().dailyDefense;
    if (dd.phase !== 'idle' || dd.isCompleted || dd.enemies.length === 0) {
      return;
    }
    applyAutoEnlistLocksForDefense(Date.now());
    const ddAfter = useDefenseStore.getState().dailyDefense;
    const chars = useCharactersStore.getState().characters;
    const lockedIds = Object.keys(ddAfter.isLocked).filter(
      (id) => ddAfter.isLocked[id],
    );
    const line = buildDefenderLineFromLocks(lockedIds, (id) => chars[id]);
    patchDailyDefense({ phase: 'preparing', defenderLine: line });
  }

  /** Auto-start at local DEFENSE_START_HOUR when still idle (manual Start remains available earlier). */
  useEffect(() => {
    if (!inGame || gameOver) return;
    const tryAutoStartNightlyDefense = () => {
      if (new Date().getHours() < DEFENSE_START_HOUR) return;
      const dd = useDefenseStore.getState().dailyDefense;
      if (dd.phase !== 'idle' || dd.isCompleted || dd.enemies.length === 0) {
        return;
      }
      if (autoNightlyDefenseDateRef.current === dd.date) return;
      applyAutoEnlistLocksForDefense(Date.now());
      const ddAfter = useDefenseStore.getState().dailyDefense;
      const chars = useCharactersStore.getState().characters;
      const lockedIds = Object.keys(ddAfter.isLocked).filter(
        (id) => ddAfter.isLocked[id],
      );
      const line = buildDefenderLineFromLocks(lockedIds, (id) => chars[id]);
      autoNightlyDefenseDateRef.current = dd.date;
      useDefenseStore.getState().patchDailyDefense({
        phase: 'preparing',
        defenderLine: line,
      });
    };
    tryAutoStartNightlyDefense();
    const intervalId = window.setInterval(tryAutoStartNightlyDefense, 30_000);
    return () => window.clearInterval(intervalId);
  }, [inGame, gameOver, dailyDefense.date]);

  /** Nightly defense: 5s prep then first round; then 3s auto rounds. */
  useEffect(() => {
    if (!inGame || gameOver || dailyDefense.phase !== 'preparing') return;
    playCombatStartSound();
    const prepTimer = window.setTimeout(() => {
      useDefenseStore.getState().patchDailyDefense({ phase: 'fighting' });
      queueMicrotask(() => advanceNightlyDefenseRound());
    }, 5000);
    return () => window.clearTimeout(prepTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset prep on phase/date identity
  }, [inGame, gameOver, dailyDefense.phase, dailyDefense.date]);

  useEffect(() => {
    if (
      !inGame ||
      gameOver ||
      dailyDefense.phase !== 'fighting' ||
      dailyDefense.isCompleted
    ) {
      return;
    }
    const intervalId = window.setInterval(() => {
      advanceNightlyDefenseRound();
      const s = useDefenseStore.getState().dailyDefense;
      if (s.isCompleted) {
        window.clearInterval(intervalId);
      }
    }, COMBAT_UI_ROUND_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inGame,
    gameOver,
    dailyDefense.phase,
    dailyDefense.isCompleted,
    dailyDefense.date,
  ]);

  function selectPlayableCharacter(characterId: string) {
    setCurrentCharacterId(characterId);
    dismissSkirmish();
    setScreen('map');
    setWorkFeedback(null);
    setAddCharacterError(null);
  }

  function goToCharacterSelection() {
    setCurrentCharacterId(null);
    dismissSkirmish();
    setScreen('map');
    setWorkFeedback(null);
    setAddCharacterError(null);
  }

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

  const workerAssignedTotal = useMemo(() => {
    if (!hexMap) return 0;
    return totalAssignedWorkersAcrossMap(hexMap);
  }, [hexMap]);

  const workerPoolFree = useMemo(
    () => workerPoolAvailable(civilianPopulation, workerAssignedTotal),
    [civilianPopulation, workerAssignedTotal],
  );

  const openExpansionContract = useMemo(() => {
    for (const c of Object.values(contracts)) {
      if (c.type === 'expansion' && c.status === 'open') return c;
    }
    return null;
  }, [contracts]);

  useEffect(() => {
    if (resolvedScreen !== 'defense') {
      queueMicrotask(() => setExpansionEnlistFeedback(null));
    }
  }, [resolvedScreen]);

  useEffect(() => {
    if (!character || resolvedScreen !== 'defense') {
      queueMicrotask(() => setExpansionEnsureHint(null));
      return;
    }
    if (character.currentHexId !== CENTER_HEX_ID) {
      queueMicrotask(() => setExpansionEnsureHint(null));
      return;
    }
    const { reason } = ensureExpansionContract();
    queueMicrotask(() =>
      setExpansionEnsureHint(
        reason === 'no_locked_hex'
          ? 'No locked frontier hex is available for a new expansion contract.'
          : null,
      ),
    );
  }, [character, resolvedScreen, contracts]);

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
      enlistedForDate: {
        ...dd.enlistedForDate,
        [character.id]: dd.date,
      },
    });
  }

  function payForWallRepair(side: WallCardinal) {
    if (!character) return;
    const w = useDefenseStore.getState().wall;
    const sec = w.sections[side];
    if (sec.current >= sec.max - 0.000_001) return;
    if (character.creds < WALL_REPAIR_CREDS_COST) return;
    const nextWall = applyWallIntegrityRepair(
      w,
      side,
      WALL_REPAIR_INTEGRITY_PER_ACTION,
    );
    updateCharacter(character.id, {
      creds: character.creds - WALL_REPAIR_CREDS_COST,
    });
    setWall({
      ...nextWall,
      lastRepairedDate: formatLocalDateString(new Date()),
    });
  }

  function hireWorker(hexId: string, slotId: string) {
    if (!hexMap || workerPoolFree <= 0) return;
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.type !== 'business' || !p.business) return p;
        const b = normalizeBusiness(p.business);
        if (b.workersAssigned >= b.workerSlots) return p;
        return {
          ...p,
          business: {
            ...b,
            workersAssigned: b.workersAssigned + 1,
          },
        };
      }),
    }));
  }

  function fireWorker(hexId: string, slotId: string) {
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.type !== 'business' || !p.business) return p;
        const b = normalizeBusiness(p.business);
        if (b.workersAssigned <= 0) return p;
        return {
          ...p,
          business: {
            ...b,
            workersAssigned: b.workersAssigned - 1,
          },
        };
      }),
    }));
  }

  function claimBusinessPassive(hexId: string, slotId: string) {
    if (!character || !hexMap) return;
    const hex = hexMap.hexes[hexId];
    const slot = hex?.placeSlots.find((s) => s.id === slotId);
    if (
      !slot ||
      slot.type !== 'business' ||
      !slot.business ||
      slot.ownedBy !== character.id
    ) {
      return;
    }
    const { business, credsAdded, items } = claimFromBusinessBuffers(
      slot.business,
    );
    if (credsAdded <= 0 && items.length === 0) return;

    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) =>
        p.id === slotId ? { ...p, business } : p,
      ),
    }));

    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return;
    const t = now;
    let seq = purchaseSeq.current;
    for (const chunk of items) {
      const stub = itemGrantTemplate(chunk.templateId);
      if (!stub) continue;
      const item: Item = {
        id: `${chunk.templateId}_${t}_${seq++}`,
        templateId: chunk.templateId,
        name: stub.name,
        type: stub.type,
        rarity: stub.rarity,
        value: stub.value,
        effects: { ...stub.effects },
        quantity: chunk.quantity,
      };
      addItem(character.id, item);
    }
    purchaseSeq.current = seq;
    updateCharacter(character.id, { creds: live.creds + credsAdded });
  }

  function buyCatalog(entry: (typeof MARKET_CATALOG)[number]) {
    if (!character) return;
    if (character.creds < entry.value) return;
    const item: Item = {
      id: `${entry.templateId}_${now}_${purchaseSeq.current++}`,
      templateId: entry.templateId,
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

  function useInventoryConsumable(item: Item) {
    if (!character) return;
    const entry = resolveMarketEntryForItem(item);
    if (!entry || entry.type !== 'consumable') return;
    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return;
    const sk = useSkirmishStore.getState();
    const skirmishActive =
      sk.session != null &&
      !sk.session.isCompleted &&
      sk.session.characterId === character.id;
    const result = tryUseConsumable({
      character: live,
      item,
      catalog: entry,
      nowMs: Date.now(),
      skirmishActive,
      skirmishCharacterId: sk.session?.characterId ?? null,
      perSkirmishUsed: sk.perSkirmishConsumableUsed,
    });
    if (!result.ok) {
      setInventoryUseFeedback(describeUseConsumableFailure(result.reason));
      window.setTimeout(() => setInventoryUseFeedback(null), 4000);
      return;
    }
    updateCharacter(character.id, result.characterPatch);
    if (result.cooldownKind === 'per_skirmish') {
      markSkirmishConsumableUsed(result.templateId);
    }
    consumeOneUnitFromInventory(character.id, item.id);
    setInventoryUseFeedback(`Usaste ${entry.name}.`);
    window.setTimeout(() => setInventoryUseFeedback(null), 3500);
  }

  function setBusinessIndustrialRecipe(
    hexId: string,
    slotId: string,
    recipe: IndustrialRecipeId,
  ) {
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.type !== 'business' || !p.business) return p;
        const b = normalizeBusiness(p.business);
        if (b.type !== 'industria') return p;
        return {
          ...p,
          business: { ...b, industrialRecipe: recipe },
        };
      }),
    }));
  }

  function depositToBusinessWarehouse(
    hexId: string,
    placeSlotId: string,
    itemId: string,
    qty: number,
  ) {
    if (!character || !itemId || qty <= 0) return;
    const live = useCharactersStore.getState().characters[character.id];
    const item = live?.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const tid = inferTemplateIdFromItem(item);
    if (!tid) return;
    const take = Math.min(qty, item.quantity);
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== placeSlotId || p.type !== 'business' || !p.business)
          return p;
        const b = normalizeBusiness(p.business);
        const { slots, deposited } = depositIntoBusinessSlots(
          b.inventorySlots,
          tid,
          take,
        );
        if (deposited <= 0) return p;
        consumeQuantityFromInventory(character.id, itemId, deposited);
        return { ...p, business: { ...b, inventorySlots: slots } };
      }),
    }));
  }

  function withdrawFromBusinessWarehouse(
    hexId: string,
    placeSlotId: string,
    slotIndex: number,
    qty: number,
  ) {
    if (!character) return;
    const wm = useWorldStore.getState().hexMap;
    const hex = wm?.hexes[hexId];
    const slot = hex?.placeSlots.find((s) => s.id === placeSlotId);
    if (!slot?.business) return;
    const b = normalizeBusiness(slot.business);
    const cell = b.inventorySlots[slotIndex];
    if (!cell || qty <= 0) return;
    const take = Math.min(qty, cell.quantity);
    const { slots, taken } = withdrawFromBusinessSlotAt(
      b.inventorySlots,
      slotIndex,
      take,
    );
    if (taken <= 0) return;
    const stub = itemGrantTemplate(cell.templateId);
    if (!stub) return;
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== placeSlotId || !p.business) return p;
        return {
          ...p,
          business: {
            ...normalizeBusiness(p.business),
            inventorySlots: slots,
          },
        };
      }),
    }));
    const grant: Item = {
      id: `${stub.templateId}_${Date.now()}_${purchaseSeq.current++}`,
      templateId: stub.templateId,
      name: stub.name,
      type: stub.type,
      rarity: stub.rarity,
      value: stub.value,
      effects: { ...stub.effects },
      quantity: taken,
    };
    addItem(character.id, grant);
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
      industria: 'Indústria',
      fabrica: 'Fábrica',
      fazenda: 'Neon Farm',
      outro: 'Venue',
    };
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.ownedBy !== character.id) return p;
        const business = createNewBusiness({
          id: bizId,
          name: labels[kind],
          type: kind,
          nowMs: now,
          productionRate: 12,
        });
        return {
          ...p,
          type: 'business' as const,
          business,
          structureHp: {
            current: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
            max: DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
          },
        };
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
        templateId: g.templateId,
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

  if (needsFirstRun) {
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

  if (needsSelection) {
    const sortedIds = [...characterIds].sort();
    return (
      <div className="game-start game-char-select">
        <h1>{GAME_TITLE}</h1>
        <p className="game-muted">Choose a character or create a new one.</p>
        <ul className="game-char-card-list" aria-label="Saved characters">
          {sortedIds.map((id) => {
            const ch = characters[id];
            return (
              <li key={id} className="game-char-card">
                <div className="game-char-card-body">
                  <strong className="game-char-card-name">{ch.name}</strong>
                  <span className="game-muted">
                    Lv {ch.level} · {ch.creds}c · STA{' '}
                    {Math.floor(
                      staminaVisualCurrentAt(ch.stamina, staminaUiTick),
                    )}
                    /{ch.stamina.max}
                  </span>
                  <span className="game-muted">Home {ch.homeHexId}</span>
                </div>
                <button
                  type="button"
                  className="game-char-card-play"
                  onClick={() => selectPlayableCharacter(id)}
                >
                  Play
                </button>
              </li>
            );
          })}
        </ul>
        <div className="game-char-new">
          <h2 className="game-char-new-title">New character</h2>
          <label htmlFor="char-name-new">Name</label>
          <input
            id="char-name-new"
            value={selectionNewName}
            onChange={(e) => {
              setSelectionNewName(e.target.value);
              setAddCharacterError(null);
            }}
            placeholder="Name"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => {
              setAddCharacterError(null);
              const result = addCharacterToWorld(selectionNewName);
              if (!result.ok) {
                setAddCharacterError(result.error);
              } else {
                setSelectionNewName('');
              }
            }}
          >
            Create
          </button>
          {addCharacterError ? (
            <p className="game-char-error" role="alert">
              {addCharacterError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!character || !hexMap) {
    return null;
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
          <p className="game-muted">
            City power{' '}
            {displayEconomicDecreasing(cityCore.energyCurrent)}/
            {displayEconomicIncreasing(cityCore.energyMax)} · stability{' '}
            {displayEconomicDecreasing(cityCore.stabilityIndex)}
          </p>
          <p className="game-muted">
            Pop {Math.floor(civilianPopulation)} · workers pool{' '}
            {workerPoolFree} free / {workerAssignedTotal} assigned
          </p>
        </div>
        <div className="game-header-stats">
          <div className="game-stat" aria-label="Health points">
            HP{' '}
            {Math.max(
              0,
              Math.floor(healthVisualCurrentAt(character.health, staminaUiTick)),
            )}
            /{character.health.max}
          </div>
          <div className="game-stat" aria-label="Stamina">
            STA{' '}
            {Math.floor(
              staminaVisualCurrentAt(character.stamina, staminaUiTick),
            )}
            /{character.stamina.max}
          </div>
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
            per hex). City economy simulates every 30 min (including offline
            catch-up when you load the game).
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
          <p>
            <button type="button" onClick={goToCharacterSelection}>
              Switch character
            </button>
          </p>
        </section>
      )}

      {resolvedScreen === 'inventory' && (
        <section className="game-panel">
          <h2>Inventory</h2>
          {inventoryUseFeedback ? (
            <p className="game-muted">{inventoryUseFeedback}</p>
          ) : null}
          {character.inventory.length === 0 ? (
            <p className="game-muted">Empty</p>
          ) : (
            <ul>
              {character.inventory.map((it) => {
                const cat = resolveMarketEntryForItem(it);
                const sub = catalogItemSubtitle(cat);
                const tid = cat?.templateId;
                const dailyBlocked =
                  !!tid &&
                  cat?.consumableCooldown === 'daily' &&
                  isDailyConsumableOnCooldown(character, tid, now);
                const dailyCd =
                  dailyBlocked && tid
                    ? ` · cooldown ~${Math.max(
                        1,
                        Math.ceil(
                          ((character.consumableCooldownUntilMs?.[tid] ?? 0) -
                            now) /
                            3_600_000,
                        ),
                      )}h`
                    : '';
                return (
                  <li key={it.id}>
                    <strong>{it.name}</strong> ×{it.quantity} ({it.value}c)
                    {sub ? (
                      <>
                        {' '}
                        <span className="game-muted">({sub})</span>
                      </>
                    ) : null}
                    {dailyCd ? (
                      <span className="game-muted">{dailyCd}</span>
                    ) : null}
                    {cat?.type === 'consumable' ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          onClick={() => useInventoryConsumable(it)}
                          disabled={dailyBlocked}
                        >
                          Use
                        </button>
                      </>
                    ) : null}
                  </li>
                );
              })}
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
          <h3>Frontier expansion</h3>
          <div className="game-contract-card">
            <p className="game-muted">
              Issued by <strong>Quartel General</strong>
            </p>
            {expansionEnsureHint ? (
              <p className="game-muted" role="status">
                {expansionEnsureHint}
              </p>
            ) : openExpansionContract ? (
              <>
                <p>
                  Target hex{' '}
                  <code className="game-hex-code">
                    {openExpansionContract.targetHexId}
                  </code>
                </p>
                <p className="game-muted">
                  Volunteers{' '}
                  {openExpansionContract.enlistedCharacterIds.length}/
                  {openExpansionContract.charSlots} · cost{' '}
                  {openExpansionContract.staminaCost} STA per enlistment
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!openExpansionContract) return;
                    const r = enlistInExpansionContract(
                      openExpansionContract.id,
                      character.id,
                      Date.now(),
                    );
                    if (!r.ok) {
                      setExpansionEnlistFeedback(r.error);
                      return;
                    }
                    setExpansionEnlistFeedback(
                      r.completed
                        ? 'Contract complete — target hex unlocked and frontier neighbors charted.'
                        : 'Enlisted. One more distinct volunteer is needed to finish.',
                    );
                  }}
                  disabled={
                    openExpansionContract.enlistedCharacterIds.includes(
                      character.id,
                    ) ||
                    openExpansionContract.enlistedCharacterIds.length >=
                      openExpansionContract.charSlots ||
                    character.stamina.current <
                      openExpansionContract.staminaCost
                  }
                >
                  Enlist ({openExpansionContract.staminaCost} STA)
                </button>
                {openExpansionContract.enlistedCharacterIds.includes(
                  character.id,
                ) ? (
                  <p className="game-muted">You are already on this contract.</p>
                ) : null}
              </>
            ) : (
              <p className="game-muted">No open expansion contract.</p>
            )}
            {expansionEnlistFeedback ? (
              <p className="game-contract-feedback" role="status">
                {expansionEnlistFeedback}
              </p>
            ) : null}
          </div>
          <p>
            Local time <strong>{formatTime(new Date(now))}</strong> · event
            hour {DEFENSE_START_HOUR}:00 — auto-starts at{' '}
            {DEFENSE_START_HOUR}:00 if still idle (you can Start earlier manually).
          </p>
          <p className="game-muted">
            Day {dailyDefense.date} · game day index {dailyDefense.gameDayIndex}{' '}
            · threat {dailyDefense.totalEnemyPoints} · phase{' '}
            <strong>{dailyDefense.phase}</strong>
            {dailyDefense.outcome !== 'active' ? (
              <>
                {' '}
                · outcome <strong>{dailyDefense.outcome}</strong>
              </>
            ) : null}
          </p>
          <p>
            {dailyDefense.outcome === 'prefeitura_siege' ? (
              <>
                Hostiles broke through — <strong>last stand at the Prefeitura</strong>{' '}
                (Centro).
              </>
            ) : (
              <>
                Tonight&apos;s push targets the{' '}
                <strong>{dailyDefense.attackedSection}</strong> wall.
              </>
            )}
          </p>
          <p className="game-muted">
            Lock for this calendar night:{' '}
            {dailyDefense.isLocked[character.id] ? 'yes' : 'no'}
          </p>
          <p className="game-muted">
            <label>
              <input
                type="checkbox"
                checked={character.autoEnlistNightlyDefense ?? true}
                onChange={() => {
                  updateCharacter(character.id, {
                    autoEnlistNightlyDefense: !(
                      character.autoEnlistNightlyDefense ?? true
                    ),
                  });
                }}
                disabled={dailyDefense.isCompleted}
              />{' '}
              Auto-enlist — spend {DEFENSE_LOCK_STA_COST} STA when nightly
              defense starts (auto or manual Start) if you have enough stamina
            </label>
          </p>
          <button
            type="button"
            onClick={tryLockDefense}
            disabled={
              dailyDefense.isLocked[character.id] ||
              character.stamina.current < DEFENSE_LOCK_STA_COST ||
              dailyDefense.isCompleted
            }
          >
            Lock ({DEFENSE_LOCK_STA_COST} STA)
          </button>
          <button
            type="button"
            onClick={beginNightlyDefense}
            disabled={
              dailyDefense.phase !== 'idle' ||
              dailyDefense.isCompleted ||
              dailyDefense.enemies.length === 0
            }
          >
            Start nightly defense
          </button>
          {dailyDefense.phase === 'preparing' ? (
            <p className="game-muted" role="status">
              Stand by — combat begins in a few seconds.
            </p>
          ) : dailyDefense.phase === 'fighting' && !dailyDefense.isCompleted ? (
            <p className="game-muted" role="status">
              {dailyDefense.outcome === 'prefeitura_siege'
                ? `Prefeitura siege — theater mode · ~${String(Math.round(COMBAT_UI_ROUND_INTERVAL_MS / 1000))}s per round.`
                : `Theater mode · ~${String(Math.round(COMBAT_UI_ROUND_INTERVAL_MS / 1000))}s per round.`}
            </p>
          ) : null}
          {dailyDefense.defenderLine.length > 0 ? (
            <ul className="game-skirmish-enemies">
              {dailyDefense.defenderLine.map((d) => (
                <li key={d.characterId}>
                  {d.name}: {d.currentHp}/{d.maxHp} HP
                  {d.retreated ? ' (fell back)' : ''}
                </li>
              ))}
            </ul>
          ) : null}
          <h3>Wall</h3>
          {(Object.keys(wall.sections) as WallCardinal[]).map((side) => (
            <div
              key={side}
              className={`game-wall-bar${dailyDefense.attackedSection === side ? ' game-wall-bar--active' : ''}`}
            >
              {side}:{' '}
              <meter
                value={wall.sections[side].current}
                min={0}
                max={wall.sections[side].max}
              />{' '}
              {displayEconomicDecreasing(wall.sections[side].current)}/
              {displayEconomicIncreasing(wall.sections[side].max)}
              {wall.sections[side].breached ? ' (breached)' : ''}
              <button
                type="button"
                className="game-inline-nav"
                onClick={() => payForWallRepair(side)}
                disabled={
                  wall.sections[side].current >= wall.sections[side].max - 0.000_001 ||
                  character.creds < WALL_REPAIR_CREDS_COST
                }
              >
                Repair (+{WALL_REPAIR_INTEGRITY_PER_ACTION}, {WALL_REPAIR_CREDS_COST}c)
              </button>
            </div>
          ))}
          <h3>Combat log</h3>
          {showDefenseCombatModal ? (
            <p className="game-muted" role="status">
              Live fight is running in the combat theater overlay (full screen).
            </p>
          ) : (
            <CombatLogList
              entries={dailyDefense.combatLog}
              autoScroll={dailyDefense.phase === 'fighting'}
            />
          )}
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
                ({WORK_STA_COST} STA — production: items only; shop: passive sales
                + claim).
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
                        {(
                          [
                            'loja',
                            'industria',
                            'fabrica',
                            'fazenda',
                          ] as const
                        ).map((k) => (
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
                        ))}
                      </span>
                    )}
                  {slot.type === 'ruin' ? (
                    <span className="game-muted">
                      {' '}
                      — Ruins (raid damage).
                    </span>
                  ) : null}
                  {slot.type === 'business' && slot.business && (() => {
                    const b = normalizeBusiness(slot.business);
                    const bufLines: string[] = [];
                    for (const [tid, q] of Object.entries(b.passiveItemBuffer)) {
                      if (q > 0) {
                        bufLines.push(
                          `${tid} ×${displayEconomicIncreasing(q)}`,
                        );
                      }
                    }
                    if (b.type === 'loja' && b.credsPending > 0) {
                      bufLines.push(
                        `creds ×${displayEconomicIncreasing(b.credsPending)} (claim)`,
                      );
                    }
                    const canHire =
                      workerPoolFree > 0 && b.workersAssigned < b.workerSlots;
                    const hasClaim =
                      (b.type === 'loja' && b.credsPending > 0.000_001) ||
                      Object.values(b.passiveItemBuffer).some(
                        (q) => q > 0.000_001,
                      );
                    return (
                      <div className="game-business-panel">
                        <span className="game-muted">
                          {' '}
                          — {b.name} (Lv {b.level}) · workers {b.workersAssigned}/
                          {b.workerSlots} · wage {b.wagePerDay}c/day each · passive{' '}
                          +{b.productionRate}/day
                        </span>
                        {bufLines.length > 0 ? (
                          <p className="game-muted game-business-buffer">
                            Buffer: {bufLines.join(' · ')}
                          </p>
                        ) : null}
                        <div className="game-business-warehouse">
                          <strong>Warehouse</strong>
                          <ul className="game-business-slots">
                            {b.inventorySlots.map((cell, idx) => (
                              <li key={idx}>
                                {cell ? (
                                  <>
                                    {getMarketCatalogEntry(cell.templateId)
                                      ?.name ?? cell.templateId}{' '}
                                    ×{cell.quantity}{' '}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        withdrawFromBusinessWarehouse(
                                          character.currentHexId,
                                          slot.id,
                                          idx,
                                          cell.quantity,
                                        )
                                      }
                                    >
                                      Withdraw all
                                    </button>
                                  </>
                                ) : (
                                  <span className="game-muted">(empty)</span>
                                )}
                              </li>
                            ))}
                          </ul>
                          <form
                            className="game-business-deposit"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!character) return;
                              const fd = new FormData(e.currentTarget);
                              const itemId = String(fd.get('itemId') ?? '');
                              const qty = Number(fd.get('qty'));
                              if (
                                !itemId ||
                                !Number.isFinite(qty) ||
                                qty < 1
                              ) {
                                return;
                              }
                              depositToBusinessWarehouse(
                                character.currentHexId,
                                slot.id,
                                itemId,
                                Math.floor(qty),
                              );
                              e.currentTarget.reset();
                            }}
                          >
                            <select
                              name="itemId"
                              required
                              aria-label="Item to deposit"
                              defaultValue=""
                            >
                              <option value="" disabled>
                                — From inventory —
                              </option>
                              {character.inventory.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name} ×{it.quantity}
                                </option>
                              ))}
                            </select>
                            <input
                              name="qty"
                              type="number"
                              min={1}
                              defaultValue={1}
                              aria-label="Quantity"
                            />
                            <button type="submit">Deposit</button>
                          </form>
                        </div>
                        <div className="game-business-actions">
                          {b.type === 'industria' ? (
                            <label className="game-business-recipe">
                              Recipe:{' '}
                              <select
                                value={b.industrialRecipe ?? 'scrap_to_metal'}
                                onChange={(e) =>
                                  setBusinessIndustrialRecipe(
                                    character.currentHexId,
                                    slot.id,
                                    e.target.value as IndustrialRecipeId,
                                  )
                                }
                              >
                                <option value="scrap_to_metal">
                                  Sucata metálica → metal
                                </option>
                                <option value="wood_log_to_lumber">
                                  Tronco → madeira
                                </option>
                              </select>
                            </label>
                          ) : null}
                          {b.type === 'fabrica' ? (
                            <span className="game-muted game-business-recipe">
                              Recipe: metal + madeira + cimento → materiais de
                              construção
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              hireWorker(character.currentHexId, slot.id)
                            }
                            disabled={!canHire}
                          >
                            Hire worker
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              fireWorker(character.currentHexId, slot.id)
                            }
                            disabled={b.workersAssigned <= 0}
                          >
                            Fire
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              claimBusinessPassive(
                                character.currentHexId,
                                slot.id,
                              )
                            }
                            disabled={!hasClaim}
                          >
                            Claim passive
                          </button>
                        </div>
                      </div>
                    );
                  })()}
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
        <CombatModal
          open
          title="Street fight"
          subtitle={
            <>
              Hex {skirmishSession.hexId} · danger{' '}
              {Math.round(skirmishSession.danger)} ·{' '}
              {skirmishSession.characterName}
            </>
          }
          hud={
            <div className="game-combat-hud">
              <div className="game-combat-hud__row">
                <span>Your HP</span>
                <strong>
                  {skirmishSession.playerHealth}/
                  {skirmishSession.playerMaxHealth}
                </strong>
              </div>
              {skirmishSession.phase === 'fighting' &&
              !skirmishSession.isCompleted ? (
                <p className="game-combat-hud__note" role="status">
                  Round cadence ~{String(Math.round(COMBAT_UI_ROUND_INTERVAL_MS / 1000))}s · log lines appear one by one.
                </p>
              ) : null}
              {skirmishReveal.pendingApprox > 0 ? (
                <p className="game-combat-hud__pending" role="status">
                  {String(skirmishReveal.pendingApprox)} line
                  {skirmishReveal.pendingApprox === 1 ? '' : 's'} queued…
                </p>
              ) : null}
            </div>
          }
          footer={
            <>
              {!skirmishSession.isCompleted ? (
                <button
                  type="button"
                  className="game-combat-modal__secondary"
                  onClick={() => skirmishReveal.flushPending()}
                >
                  Show all lines now
                </button>
              ) : null}
              {skirmishSession.isCompleted ? (
                <>
                  {skirmishSession.outcome === 'win' ? (
                    <p className="game-skirmish-result">
                      Victory — +{STREET_SKIRMISH_SCRAP_REWARD_QTY} scrap metal, +
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
              ) : null}
            </>
          }
        >
          {skirmishSession.enemies.length > 0 ? (
            <ul className="game-skirmish-enemies">
              {skirmishSession.enemies.map((e, i) => (
                <li key={`${e.enemyId}-${i}`}>
                  {e.enemyId} ({e.tacticalBucket ?? 'front'}) — {e.currentHealth}{' '}
                  HP
                </li>
              ))}
            </ul>
          ) : (
            <p className="game-muted">No hostiles left.</p>
          )}
          {skirmishSession.phase === 'preparing' ? (
            <p className="game-muted" role="status">
              Stand by — combat begins in a few seconds.
            </p>
          ) : null}
          <h3>Battle feed</h3>
          <CombatLogList
            entries={skirmishReveal.visibleEntries}
            className="game-combat-log--skirmish game-combat-log--theater"
            autoScroll={skirmishSession.phase === 'fighting'}
          />
        </CombatModal>
      ) : null}

      {showDefenseCombatModal ? (
        <CombatModal
          open
          title={
            dailyDefense.outcome === 'prefeitura_siege'
              ? 'Prefeitura siege'
              : 'Nightly defense'
          }
          subtitle={
            <>
              Night {dailyDefense.date} · game day {dailyDefense.gameDayIndex} ·
              threat {dailyDefense.totalEnemyPoints} · phase{' '}
              <strong>{dailyDefense.phase}</strong>
              {dailyDefense.outcome !== 'active' ? (
                <>
                  {' '}
                  · outcome <strong>{dailyDefense.outcome}</strong>
                </>
              ) : null}
            </>
          }
          hud={
            <div className="game-combat-hud">
              <div className="game-combat-hud__spirit">
                <div className="game-combat-hud__row">
                  <span>Ally spirit</span>
                  <strong>
                    {dailyDefense.allySpirit ?? ALLY_SPIRIT_INITIAL}/
                    {ALLY_SPIRIT_MAX}
                  </strong>
                </div>
                <meter
                  className="game-combat-spirit-meter"
                  value={dailyDefense.allySpirit ?? ALLY_SPIRIT_INITIAL}
                  min={0}
                  max={ALLY_SPIRIT_MAX}
                />
                {(dailyDefense.moraleShockTurnsRemaining ?? 0) > 0 ? (
                  <p className="game-combat-shock" role="status">
                    Morale shock — defender pressure damped ·{' '}
                    {String(dailyDefense.moraleShockTurnsRemaining ?? 0)} round
                    {(dailyDefense.moraleShockTurnsRemaining ?? 0) === 1
                      ? ''
                      : 's'}{' '}
                    left
                  </p>
                ) : null}
              </div>
              <div className="game-combat-hud__grid">
                <div>
                  <span className="game-muted">Round</span>
                  <strong>{dailyDefense.currentTurn}</strong>
                </div>
                <div>
                  <span className="game-muted">Focus wall</span>
                  <strong>{dailyDefense.attackedSection}</strong>
                </div>
                <div>
                  <span className="game-muted">Hostiles (F/R/S)</span>
                  <strong>
                    {countLivingInBucket(dailyDefense.enemies, 'front')}/
                    {countLivingInBucket(dailyDefense.enemies, 'ranged')}/
                    {countLivingInBucket(dailyDefense.enemies, 'support')}
                  </strong>
                </div>
              </div>
              <div className="game-combat-hud__wall">
                <span className="game-muted">
                  Wall {dailyDefense.attackedSection}
                </span>
                <meter
                  value={wall.sections[dailyDefense.attackedSection].current}
                  min={0}
                  max={wall.sections[dailyDefense.attackedSection].max}
                />
              </div>
              {defenseReveal.pendingApprox > 0 ? (
                <p className="game-combat-hud__pending" role="status">
                  {String(defenseReveal.pendingApprox)} line
                  {defenseReveal.pendingApprox === 1 ? '' : 's'} queued…
                </p>
              ) : null}
            </div>
          }
          footer={
            <>
              {!dailyDefense.isCompleted ? (
                <button
                  type="button"
                  className="game-combat-modal__secondary"
                  onClick={() => defenseReveal.flushPending()}
                >
                  Show all lines now
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setDefenseCombatDismissed(true)}
                >
                  Close theater
                </button>
              )}
            </>
          }
        >
          {dailyDefense.defenderLine.length > 0 ? (
            <>
              <h3>Defender line</h3>
              <ul className="game-skirmish-enemies">
                {dailyDefense.defenderLine.map((d) => (
                  <li key={d.characterId}>
                    {d.name} ({d.tacticalBucket ?? 'front'}) — {d.currentHp}/
                    {d.maxHp} HP
                    {d.retreated ? ' · fell back' : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {dailyDefense.enemies.length > 0 ? (
            <>
              <h3>Hostile pressure</h3>
              <ul className="game-skirmish-enemies">
                {dailyDefense.enemies.map((e, i) => (
                  <li key={`${e.enemyId}-${i}`}>
                    {e.enemyId} ({e.tacticalBucket ?? 'front'}) —{' '}
                    {e.currentHealth}/{e.maxHealth} HP
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="game-muted">No hostiles in this wave.</p>
          )}
          {dailyDefense.phase === 'preparing' ? (
            <p className="game-muted" role="status">
              Stand by — positions lock — first round incoming.
            </p>
          ) : dailyDefense.phase === 'fighting' && !dailyDefense.isCompleted ? (
            <p className="game-muted" role="status">
              Rounds advance ~ every {String(Math.round(COMBAT_UI_ROUND_INTERVAL_MS / 1000))}s; each line appears ~ every {String(Math.round(COMBAT_UI_LOG_LINE_MS / 1000))}s.
            </p>
          ) : null}
          <h3>Battle feed</h3>
          <CombatLogList
            entries={defenseReveal.visibleEntries}
            className="game-combat-log--theater"
            autoScroll={
              dailyDefense.phase === 'fighting' || dailyDefense.phase === 'ended'
            }
          />
        </CombatModal>
      ) : null}

      {defenseCatchUpSummary ? (
        <div
          className="game-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="defense-catchup-title"
        >
          <div className="game-modal game-modal--catchup">
            <h2 id="defense-catchup-title">Noites simuladas</h2>
            <p className="game-muted">
              Adiantamos automaticamente as defesas enquanto você esteve offline.
              Abaixo está o resultado por dia civil (sem detalhes de recompensas individuais — o estado do jogo já foi atualizado).
            </p>
            <ul className="game-defense-catchup-list">
              {defenseCatchUpSummary.nightSummaries.map((row) => (
                <li key={`${row.date}-${row.gameDayIndex}`}>
                  <strong>{row.date}</strong>
                  {' · '}
                  Dia {row.gameDayIndex}
                  {' · '}
                  {defenseCatchUpOutcomeLabel(row.outcome)}
                </li>
              ))}
            </ul>
            <p className="game-muted">
              Noites processadas: {defenseCatchUpSummary.nightsProcessed}
            </p>
            {defenseCatchUpSummary.abortedOnGameOver ? (
              <p className="game-muted" role="alert">
                A última simulação terminou em falha catastrófica (game over).
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => dismissDefenseCatchUpSummary()}
            >
              Continuar
            </button>
          </div>
        </div>
      ) : defenseEndScreen ? (
        <div
          className="game-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="defense-end-title"
        >
          <div className="game-modal">
            {defenseEndScreen.kind === 'victory' ? (
              <>
                <h2 id="defense-end-title">Defense held</h2>
                <p className="game-muted">
                  The perimeter holds — nightly defense succeeded.
                </p>
                {defenseEndScreen.participants.length === 0 ? (
                  <p className="game-muted">
                    No player line this night — static defenses carried the sector.
                  </p>
                ) : (
                  <ul className="game-skirmish-enemies">
                    {defenseEndScreen.participants.map((p) => (
                      <li key={p.characterId}>
                        <strong>{p.name}</strong>
                        <span className="game-muted">
                          {' '}
                          +{p.scoreDelta} score, +{p.reputationDelta} rep, +
                          {p.credsDelta} creds
                        </span>
                        {p.items.length > 0 ? (
                          <ul className="game-defense-spoils">
                            {p.items.map((it) => (
                              <li key={it.id}>
                                {it.name} × {it.quantity}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <h2 id="defense-end-title">Wall breached</h2>
                <p>
                  Hostiles broke through — the city was raided. Repair the walls
                  and recover what you can.
                </p>
              </>
            )}
            <button type="button" onClick={() => dismissDefenseEndScreen()}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      <GameFabBar
        activeScreen={resolvedScreen}
        onSelect={setScreen}
        items={fabActionItems}
      />

      {gameOver ? (
        <GameOverOverlay
          reason={gameOverReason ?? 'prefeitura_fallen'}
          endedAt={gameOverAt}
        />
      ) : null}
    </div>
  );
}
