import { useEffect, useMemo, useRef, useState } from 'react';

import {
  BUILDING_CONSTRUCTION_SUPPLIES_COST,
  CENTER_HEX_ID,
  COMBAT_UI_LOG_LINE_MS,
  DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
  DEFENSE_LOCK_STA_COST,
  DEFENSE_START_HOUR,
  ECONOMIC_TICK_INTERVAL_MS,
  EMPTY_LOT_PRICE,
  HOSPITAL_CURE_CREDS,
  HOSPITAL_CURE_HP,
  INITIAL_CIVILIAN_POPULATION,
  NPC_OWNER_CITY,
  NPC_OWNER_PREFEITURA,
  OFFENSIVE_CONTRACT_CHAR_SLOTS,
  OFFENSIVE_CONTRACT_STA_COST,
  PATROL_STA_COST,
  STREET_SKIRMISH_SCRAP_REWARD_QTY,
  STREET_SKIRMISH_WIN_SCORE,
  STAMINA_REGEN_UI_INTERVAL_MS,
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
import { playerBuildableCatalog, getBuildingDef } from '../domain/catalog/buildings.ts';
import { createNewBusiness } from '../domain/factories/createBusiness.ts';
import { applyHospitalCure } from '../domain/hospitalCure.ts';
import { mergePantry } from '../domain/orderBook.ts';
import { cancelOrder, placeOrder, type MarketOrder } from '../domain/orderBook.ts';
import { useMarketStore } from '../stores/useMarketStore.ts';
import {
  displayEconomicDecreasing,
  displayEconomicIncreasing,
} from '../domain/economicDisplay.ts';
import {
  findCityHallFeature,
  findWallFeature,
  repairWallOnHexTile,
} from '../domain/encounterCombatWall.ts';
import {
  hexHasWorkTarget,
  itemGrantTemplate,
  mergeItemGrants,
  resolveManualWork,
  type ItemGrant,
} from '../domain/businessPayout.ts';
import {
  axialNeighbors,
  isAxialNeighbor,
  parseHexKey,
} from '../domain/hex.ts';
import { healthVisualCurrentAt } from '../domain/healthRegen.ts';
import { staminaVisualCurrentAt } from '../domain/stamina.ts';
import { makeBusinessId } from '../domain/ids.ts';
import type { NightlyDefenseOutcome } from '../domain/types/index.ts';
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
import { enlistInOffensiveContract } from '../game/offensiveContracts.ts';
import { playCombatStartSound } from '../audio/playCombatStartSound.ts';
import { applyAutoEnlistLocksForDefense } from '../game/applyAutoEnlistLocksForDefense.ts';
import { countLivingInBucket } from '../domain/defenseTactics.ts';
import { buildDefenderLineFromLocks } from '../domain/nightlyDefenseCombat.ts';
import { runEconomicCatchUp } from '../game/economicCatchUp.ts';
import { startNewGame } from '../game/startNewGame.ts';
import { syncGlobalScoreboardFromCharacters } from '../game/syncScoreboard.ts';
import {
  formatEncounterChancePercent,
  rollPatrolEncounter,
} from '../domain/patrolEncounter.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useDefenseStore } from '../stores/useDefenseStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useSkirmishStore } from '../stores/useSkirmishStore.ts';
import { replayCombatLog } from '../domain/battleReplayLog.ts';
import { useBattleArchiveStore } from '../stores/useBattleArchiveStore.ts';
import { useExpansionStore } from '../stores/useExpansionStore.ts';
import { useOffensiveStore } from '../stores/useOffensiveStore.ts';
import { algoProgramFromLoadout } from '../domain/combat/ai/algoProgram.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

import { CombatLogTurnTabPanel } from './CombatLogTurnTabPanel.tsx';
import { CombatLoadoutEditor } from './CombatLoadoutEditor.tsx';
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
  const [battlesOpen, setBattlesOpen] = useState(false);
  const [replayId, setReplayId] = useState<number | null>(null);
  const [offensiveFeedback, setOffensiveFeedback] = useState<string | null>(
    null,
  );
  const [inventoryUseFeedback, setInventoryUseFeedback] = useState<
    string | null
  >(null);
  const [marketDraft, setMarketDraft] = useState({
    side: 'sell' as 'buy' | 'sell',
    templateId: '',
    price: '1',
    qty: '1',
  });

  const hexMap = useWorldStore((s) => s.hexMap);
  const characters = useCharactersStore((s) => s.characters);
  const currentId = useCharactersStore((s) => s.currentCharacterId);
  const setCurrentCharacterId = useCharactersStore(
    (s) => s.setCurrentCharacterId,
  );
  const updateCharacter = useCharactersStore((s) => s.updateCharacter);
  const addItem = useCharactersStore((s) => s.addItemToInventory);
  const consumeOneUnitFromInventory = useCharactersStore(
    (s) => s.consumeOneUnitFromInventory,
  );
  const consumeQuantityFromInventory = useCharactersStore(
    (s) => s.consumeQuantityFromInventory,
  );
  const updateHex = useWorldStore((s) => s.updateHex);

  const dailyDefense = useDefenseStore((s) => s.dailyDefense);
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
  const skirmishSession = useSkirmishStore((s) => s.session);
  const startSkirmishFromPatrol = useSkirmishStore((s) => s.startFromPatrol);
  const dismissSkirmish = useSkirmishStore((s) => s.dismiss);
  const cityCore = useCityStore((s) => s.cityCore);
  const treasury = useCityStore((s) => s.treasury);
  const pantry = useCityStore((s) => s.pantry);
  const brownoutThisWageDay = useCityStore((s) => s.brownoutThisWageDay);
  const chronicle = useCityStore((s) => s.chronicle ?? []);
  const cityThreatLevel = useCityStore((s) => s.cityThreatLevel ?? 0);
  const offensiveSession = useOffensiveStore((s) => s.session);
  const startOffensiveSortieUi = useOffensiveStore((s) => s.startSortie);
  const dismissOffensiveSession = useOffensiveStore((s) => s.dismiss);
  const expansionSession = useExpansionStore((s) => s.session);
  const dismissExpansionSession = useExpansionStore((s) => s.dismiss);
  const battleEntries = useBattleArchiveStore((s) => s.entries);
  const marketOrders = useMarketStore((s) => s.orders);
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

  const skirmishRevealKey = skirmishSession
    ? `sk-${skirmishSession.characterId}-${skirmishSession.hexId}-${String(skirmishSession.combatLog[0]?.id ?? 0)}`
    : 'sk-idle';
  const skirmishReveal = useCombatLogReveal(
    skirmishSession?.combatLog ?? [],
    skirmishRevealKey,
    COMBAT_UI_LOG_LINE_MS,
  );

  useEffect(() => {
    if (!skirmishSession) return;
    playCombatStartSound();
  }, [skirmishRevealKey]);

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

  /** Nightly defense: short prep, then one full simulateBattle (playback only). */
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

  function selectPlayableCharacter(characterId: string) {
    setCurrentCharacterId(characterId);
    setScreen('map');
    setWorkFeedback(null);
    setAddCharacterError(null);
  }

  function goToCharacterSelection() {
    setCurrentCharacterId(null);
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

  const targetWallFeature = useMemo(
    () => findWallFeature(hexMap?.hexes[dailyDefense.targetHexId]?.features),
    [hexMap, dailyDefense.targetHexId],
  );

  const centerCityHallFeature = useMemo(
    () => findCityHallFeature(hexMap?.hexes[CENTER_HEX_ID]?.features),
    [hexMap],
  );

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

  const openOffensiveContract = useMemo(() => {
    for (const c of Object.values(contracts)) {
      if (c.type === 'offensive' && c.status === 'open') return c;
    }
    return null;
  }, [contracts]);

  useEffect(() => {
    if (resolvedScreen !== 'defense') {
      queueMicrotask(() => {
        setExpansionEnlistFeedback(null);
        setOffensiveFeedback(null);
      });
    }
  }, [resolvedScreen]);

  const offensiveRevealKey = offensiveSession
    ? `${offensiveSession.contractId}-${offensiveSession.outcome}-${String(offensiveSession.combatLog.length)}`
    : 'idle';
  const offensiveReveal = useCombatLogReveal(
    offensiveSession ? offensiveSession.combatLog : [],
    COMBAT_UI_LOG_LINE_MS,
    offensiveRevealKey,
  );

  const expansionLog = useMemo(
    () => (expansionSession ? replayCombatLog(expansionSession.reel) : []),
    [expansionSession],
  );
  const expansionRevealKey = expansionSession
    ? `ex-${expansionSession.contractId}-${expansionSession.reel.battleResult.battleId}`
    : 'ex-idle';
  const expansionReveal = useCombatLogReveal(
    expansionLog,
    expansionRevealKey,
    COMBAT_UI_LOG_LINE_MS,
  );
  const replayEntry =
    replayId == null
      ? null
      : (battleEntries.find((entry) => entry.id === replayId) ?? null);
  const replayLog = useMemo(
    () => (replayEntry ? replayCombatLog(replayEntry) : []),
    [replayEntry],
  );
  const replayRevealKey = replayEntry
    ? `replay-${String(replayEntry.id)}`
    : 'replay-idle';
  const replayReveal = useCombatLogReveal(
    replayLog,
    replayRevealKey,
    COMBAT_UI_LOG_LINE_MS,
  );

  useEffect(() => {
    if (!expansionSession) return;
    playCombatStartSound();
  }, [expansionSession]);

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
          ? 'Não há hex fechado na fronteira para um novo contrato.'
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
    if (skirmishSession) return;
    const t = now;
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
        danger: hex.danger,
        random: Math.random,
      })
    ) {
      startSkirmishFromPatrol({
        hexId: targetHexId,
        danger: hex.danger,
        characterId: character.id,
        characterName: character.name,
        playerHealth: character.health.current,
        playerMaxHealth: character.health.max,
        coreAttributes: character.coreAttributes,
        skillIds: character.combatLoadout.skillIds,
        combatRole: character.combatLoadout.combatRole,
        algoProgram: algoProgramFromLoadout(character.combatLoadout),
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

  function payForWallRepair() {
    if (!character || !hexMap) return;
    const wf = findWallFeature(hexMap.hexes[dailyDefense.targetHexId]?.features);
    if (!wf || wf.currentHp >= wf.maxHp - 0.000_001) return;
    if (character.creds < WALL_REPAIR_CREDS_COST) return;
    updateCharacter(character.id, {
      creds: character.creds - WALL_REPAIR_CREDS_COST,
    });
    updateHex(dailyDefense.targetHexId, (tile) =>
      repairWallOnHexTile(tile, WALL_REPAIR_INTEGRITY_PER_ACTION),
    );
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
    const { business, items } = claimFromBusinessBuffers(slot.business);
    if (items.length === 0) return;

    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) =>
        p.id === slotId ? { ...p, business } : p,
      ),
    }));

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
  }

  function inventoryTemplateQty(templateId: string): number {
    if (!character) return 0;
    return character.inventory.reduce(
      (n, item) => n + (item.templateId === templateId ? item.quantity : 0),
      0,
    );
  }

  function consumeTemplate(templateId: string, qty: number): boolean {
    if (!character) return false;
    if (inventoryTemplateQty(templateId) < qty) return false;
    let left = qty;
    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return false;
    for (const item of live.inventory) {
      if (left <= 0) break;
      if (item.templateId !== templateId) continue;
      const take = Math.min(left, item.quantity);
      consumeQuantityFromInventory(character.id, item.id, take);
      left -= take;
    }
    return left <= 0;
  }

  function applyOrderFills(
    placed: ReturnType<typeof placeOrder>,
    actorId: string,
  ) {
    const live = useCharactersStore.getState().characters[actorId];
    if (!live) return;
    let creds = live.creds + (placed.credsRefund ?? 0);
    const sellerCreds = placed.credsToSeller[actorId] ?? 0;
    creds += sellerCreds;
    updateCharacter(actorId, { creds });
    for (const [sellerId, amount] of Object.entries(placed.credsToSeller)) {
      if (sellerId === actorId || sellerId === NPC_OWNER_PREFEITURA) continue;
      const other = useCharactersStore.getState().characters[sellerId];
      if (other) updateCharacter(sellerId, { creds: other.creds + amount });
    }
    let seq = purchaseSeq.current;
    const pantryAdd: Record<string, number> = {};
    for (const item of placed.itemsToBuyer) {
      if (item.ownerId === NPC_OWNER_PREFEITURA) {
        pantryAdd[item.templateId] = (pantryAdd[item.templateId] ?? 0) + item.quantity;
        continue;
      }
      const stub = itemGrantTemplate(item.templateId);
      if (!stub) continue;
      if (!useCharactersStore.getState().characters[item.ownerId]) continue;
      addItem(item.ownerId, {
        id: `${item.templateId}_${now}_${seq++}`,
        templateId: stub.templateId,
        name: stub.name,
        type: stub.type,
        rarity: stub.rarity,
        value: stub.value,
        effects: { ...stub.effects },
        quantity: item.quantity,
      });
    }
    purchaseSeq.current = seq;
    if (Object.keys(pantryAdd).length > 0) {
      useCityStore.getState().setPantry(mergePantry(useCityStore.getState().pantry ?? {}, pantryAdd));
    }
    if (placed.credsToSeller[NPC_OWNER_PREFEITURA]) {
      useCityStore.getState().setTreasury(
        (useCityStore.getState().treasury ?? 0) + placed.credsToSeller[NPC_OWNER_PREFEITURA],
      );
    }
  }

  function submitMarketOrder(
    side: 'buy' | 'sell',
    templateId: string,
    unitPrice: number,
    quantity: number,
  ): boolean {
    if (!character) return false;
    if (quantity <= 0 || unitPrice <= 0) return false;
    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return false;
    if (side === 'sell' && !consumeTemplate(templateId, quantity)) return false;
    if (side === 'buy') {
      const cost = unitPrice * quantity;
      if (live.creds < cost) return false;
      updateCharacter(character.id, { creds: live.creds - cost });
    }
    const order: MarketOrder = {
      id: `ord_${now}_${purchaseSeq.current++}`,
      side,
      templateId,
      unitPrice,
      quantity,
      ownerId: character.id,
      createdAt: now,
    };
    const book = useMarketStore.getState().orders ?? [];
    const placed = placeOrder(book, order);
    useMarketStore.getState().setOrders(placed.orders);
    applyOrderFills(placed, character.id);
    return true;
  }

  function cancelMarketOrder(orderId: string) {
    if (!character) return;
    const book = useMarketStore.getState().orders ?? [];
    const result = cancelOrder(book, orderId, character.id);
    if (!result.released) return;
    useMarketStore.getState().setOrders(result.orders);
    if (result.released.side === 'buy') {
      const live = useCharactersStore.getState().characters[character.id];
      if (live) {
        updateCharacter(character.id, {
          creds: live.creds + result.released.quantity * result.released.unitPrice,
        });
      }
      return;
    }
    const stub = itemGrantTemplate(result.released.templateId);
    if (!stub) return;
    addItem(character.id, {
      id: `${result.released.templateId}_${now}_${purchaseSeq.current++}`,
      ...stub,
      quantity: result.released.quantity,
    });
  }

  function handleInventoryConsumable(item: Item) {
    if (!character) return;
    const entry = resolveMarketEntryForItem(item);
    if (!entry || entry.type !== 'consumable') return;
    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return;
    const result = tryUseConsumable({
      character: live,
      item,
      catalog: entry,
      nowMs: Date.now(),
    });
    if (!result.ok) {
      setInventoryUseFeedback(describeUseConsumableFailure(result.reason));
      window.setTimeout(() => setInventoryUseFeedback(null), 4000);
      return;
    }
    updateCharacter(character.id, result.characterPatch);
    consumeOneUnitFromInventory(character.id, item.id);
    setInventoryUseFeedback(`Usaste ${entry.name}.`);
    window.setTimeout(() => setInventoryUseFeedback(null), 3500);
  }

  function setBusinessRecipe(hexId: string, slotId: string, recipeId: string) {
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.type !== 'business' || !p.business) return p;
        const b = normalizeBusiness(p.business);
        const def = getBuildingDef(b.buildingId);
        if (!def || !def.recipes.some((r) => r.id === recipeId)) return p;
        return { ...p, business: { ...b, recipeId } };
      }),
    }));
  }

  function setBusinessPublic(hexId: string, slotId: string, isPublic: boolean, taxPct: number) {
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.type !== 'business' || !p.business) return p;
        if (!character || p.ownedBy !== character.id) return p;
        const b = normalizeBusiness(p.business);
        const tax = Math.min(1, Math.max(0, taxPct / 100));
        return { ...p, business: { ...b, public: isPublic, publicWorkTax: tax } };
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

  function establishBusiness(hexId: string, slotId: string, buildingId: string) {
    if (!character) return;
    const def = getBuildingDef(buildingId);
    if (!def) return;
    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return;
    let need = BUILDING_CONSTRUCTION_SUPPLIES_COST;
    for (const item of live.inventory) {
      if (item.templateId === 'construction_supplies') need -= item.quantity;
    }
    if (need > 0) return;
    let remaining = BUILDING_CONSTRUCTION_SUPPLIES_COST;
    for (const item of live.inventory) {
      if (remaining <= 0) break;
      if (item.templateId !== 'construction_supplies') continue;
      const take = Math.min(remaining, item.quantity);
      consumeQuantityFromInventory(character.id, item.id, take);
      remaining -= take;
    }
    const meta = useMetaStore.getState();
    const bizNum = meta.nextIds.business + 1;
    const bizId = makeBusinessId(bizNum);
    patchNextIds({ business: bizNum });
    updateHex(hexId, (h) => ({
      ...h,
      placeSlots: h.placeSlots.map((p) => {
        if (p.id !== slotId || p.ownedBy !== character.id) return p;
        const business = createNewBusiness({
          id: bizId,
          buildingId,
          nowMs: now,
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
    if (!hexHasWorkTarget(hex, character.id)) {
      setWorkFeedback('Fique num hex com um negócio seu ou público para trabalhar.');
      return;
    }
    const t = now;
    const rawGrants: ItemGrant[] = [];
    let pantryAdd: Record<string, number> = {};

    const newSlots = hex.placeSlots.map((p) => {
      if (p.type !== 'business' || !p.business) return p;
      const normalized = normalizeBusiness(p.business);
      const isOwner = p.ownedBy === character.id;
      if (!isOwner && !normalized.public) return p;
      const y = resolveManualWork(p.business, character.id, p.ownedBy);
      rawGrants.push(...y.grants);
      if (p.ownedBy === NPC_OWNER_PREFEITURA) {
        for (const share of y.ownerShare) {
          pantryAdd = {
            ...pantryAdd,
            [share.templateId]: (pantryAdd[share.templateId] ?? 0) + share.quantity,
          };
        }
      }
      return { ...p, business: { ...y.business, lastProduction: t } };
    });

    updateHex(character.currentHexId, (h) => ({ ...h, placeSlots: newSlots }));
    if (Object.keys(pantryAdd).length > 0) {
      const current = useCityStore.getState().pantry ?? {};
      useCityStore.getState().setPantry(mergePantry(current, pantryAdd));
    }

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
      stamina: {
        ...live.stamina,
        current: live.stamina.current - WORK_STA_COST,
        lastUpdated: t,
      },
    });

    setWorkFeedback(
      merged.length > 0
        ? merged.map((g) => `+${g.quantity}× ${g.name}`).join(', ')
        : `Gastou ${WORK_STA_COST} STA.`,
    );
  }

  function cureAtHospital() {
    if (!character || !hexMap) return;
    const hex = hexMap.hexes[character.currentHexId];
    const slot = hex?.placeSlots.find(
      (p) =>
        p.type === 'business' &&
        p.business &&
        normalizeBusiness(p.business).buildingId === 'hospital',
    );
    if (!slot) return;
    const live = useCharactersStore.getState().characters[character.id];
    if (!live) return;
    const power = useCityStore.getState().cityCore.energyCurrent;
    const result = applyHospitalCure({
      hp: live.health.current,
      maxHp: live.health.max,
      creds: live.creds,
      credsCost: HOSPITAL_CURE_CREDS,
      power,
    });
    if (!result.ok) {
      setWorkFeedback(result.reason === 'no_power' ? 'Sem energia para a cura.' : 'Creds insuficientes.');
      return;
    }
    updateCharacter(character.id, {
      creds: live.creds - HOSPITAL_CURE_CREDS,
      health: { ...live.health, current: result.hp },
    });
    useCityStore.getState().patchCityCore({ energyCurrent: result.power });
    setWorkFeedback(`Cura: +${HOSPITAL_CURE_HP} HP.`);
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
                  {battleEntries.some(
                    (entry) =>
                      entry.participantCharacterIds.includes(id) &&
                      !entry.seenByCharacterIds.includes(id),
                  ) ? (
                    <span className="game-muted">Batalha não vista</span>
                  ) : null}
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
  const canWorkOnCurrentHex = hexHasWorkTarget(currentHex, character.id);
  const atCenter = character.currentHexId === CENTER_HEX_ID;
  const atHome = character.currentHexId === character.homeHexId;
  const inventoryByTemplate = new Map<string, { name: string; quantity: number }>();
  for (const item of character.inventory) {
    if (!item.templateId) continue;
    const prev = inventoryByTemplate.get(item.templateId);
    if (prev) prev.quantity += item.quantity;
    else inventoryByTemplate.set(item.templateId, { name: item.name, quantity: item.quantity });
  }
  const sellItemChoices = [...inventoryByTemplate.entries()];
  if (
    marketDraft.side === 'sell' &&
    marketDraft.templateId &&
    !inventoryByTemplate.has(marketDraft.templateId)
  ) {
    const entry = getMarketCatalogEntry(marketDraft.templateId);
    if (entry) sellItemChoices.push([entry.templateId, { name: entry.name, quantity: 0 }]);
  }

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
            {displayEconomicIncreasing(cityCore.energyMax)}
            {brownoutThisWageDay ? ' · apagão' : ''} · tesouro {Math.floor(treasury ?? 0)}c
          </p>
          <p className="game-muted">
            Pop {Math.floor(civilianPopulation)} · despensa comida{' '}
            {Math.floor(pantry?.food_ration ?? 0)} · bens{' '}
            {Math.floor(pantry?.consumer_goods ?? 0)} · workers pool{' '}
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
        <button
          type="button"
          data-active={battlesOpen}
          onClick={() => setBattlesOpen((open) => !open)}
        >
          Batalhas
          {battleEntries.some(
            (entry) =>
              entry.participantCharacterIds.includes(character.id) &&
              !entry.seenByCharacterIds.includes(character.id),
          )
            ? ' · nova'
            : ''}
        </button>
      </nav>

      {battleEntries.some(
        (entry) =>
          entry.participantCharacterIds.includes(character.id) &&
          !entry.seenByCharacterIds.includes(character.id),
      ) ? (
        <p className="game-contract-feedback" role="status">
          Este personagem participou de uma batalha que ainda não viu.
        </p>
      ) : null}

      {battlesOpen ? (
        <section className="game-panel" aria-label="Batalhas">
          <h2>Batalhas</h2>
          {battleEntries.length === 0 ? (
            <p className="game-muted">Nenhuma batalha arquivada.</p>
          ) : (
            <ul className="game-char-card-list">
              {[...battleEntries].reverse().map((entry) => {
                const unseen =
                  entry.participantCharacterIds.includes(character.id) &&
                  !entry.seenByCharacterIds.includes(character.id);
                return (
                  <li key={entry.id} className="game-char-card">
                    <div className="game-char-card-body">
                      <strong>{entry.title}</strong>
                      <span className="game-muted">
                        {entry.outcome}
                        {unseen ? ' · não vista' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        useBattleArchiveStore
                          .getState()
                          .markSeen(entry.id, character.id);
                        setReplayId(entry.id);
                      }}
                    >
                      Ver
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {resolvedScreen === 'map' && (
        <section className="game-panel">
          <h2>Hex map</h2>
          <p className="game-muted">
            You are at <strong>{character.currentHexId}</strong>. Neighbors
            cost {PATROL_STA_COST} STA. Entering a hex may trigger a street
            encounter; higher <strong>dng</strong> raises the chance (approx{' '}
            {formatEncounterChancePercent(
              hexMap?.hexes[character.currentHexId]?.danger ?? 0,
            )}{' '}
            here). City economy simulates every 30 min (including offline
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
          <CombatLoadoutEditor
            skillIds={character.combatLoadout.skillIds}
            combatRole={character.combatLoadout.combatRole ?? 'frontline'}
            policyMode={character.combatLoadout.policyMode ?? 'autoplay'}
            algoRules={character.combatLoadout.algoRules ?? []}
            onChangeSkillIds={(skillIds) =>
              updateCharacter(character.id, {
                combatLoadout: {
                  ...character.combatLoadout,
                  skillIds,
                },
              })
            }
            onChangeCombatRole={(combatRole) =>
              updateCharacter(character.id, {
                combatLoadout: {
                  ...character.combatLoadout,
                  combatRole,
                },
              })
            }
            onChangePolicyMode={(policyMode) =>
              updateCharacter(character.id, {
                combatLoadout: {
                  ...character.combatLoadout,
                  policyMode,
                },
              })
            }
            onChangeAlgoRules={(algoRules) =>
              updateCharacter(character.id, {
                combatLoadout: {
                  ...character.combatLoadout,
                  algoRules,
                },
              })
            }
          />
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
                          onClick={() => handleInventoryConsumable(it)}
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
          <h2>Livro de ordens</h2>
          {!atCenter ? (
            <p className="game-muted">
              O mercado fica no <strong>Centro</strong> ({CENTER_HEX_ID}). Você está em{' '}
              <strong>{character.currentHexId}</strong>.
            </p>
          ) : (
            <>
              <p className="game-muted">
                Ordem de venda tira o item do inventário. Ordem de compra reserva os creds.
                Clique numa venda para preencher a compra exata.
              </p>
              <form
                className="game-business-deposit"
                onSubmit={(e) => {
                  e.preventDefault();
                  const unitPrice = Number(marketDraft.price);
                  const quantity = Math.floor(Number(marketDraft.qty));
                  if (!marketDraft.templateId || unitPrice <= 0 || quantity <= 0) return;
                  const placed = submitMarketOrder(
                    marketDraft.side,
                    marketDraft.templateId,
                    unitPrice,
                    quantity,
                  );
                  if (!placed) return;
                  setMarketDraft({
                    side: 'sell',
                    templateId: '',
                    price: '1',
                    qty: '1',
                  });
                }}
              >
                <select
                  name="side"
                  aria-label="Lado"
                  value={marketDraft.side}
                  onChange={(e) => {
                    const side = e.target.value as 'buy' | 'sell';
                    setMarketDraft((draft) => {
                      if (side === 'sell' && inventoryTemplateQty(draft.templateId) <= 0) {
                        return { ...draft, side, templateId: '' };
                      }
                      return { ...draft, side };
                    });
                  }}
                >
                  <option value="sell">Vender</option>
                  <option value="buy">Comprar</option>
                </select>
                <select
                  name="templateId"
                  required
                  aria-label="Item"
                  value={marketDraft.templateId}
                  onChange={(e) =>
                    setMarketDraft((draft) => ({ ...draft, templateId: e.target.value }))
                  }
                >
                  <option value="">
                    {marketDraft.side === 'sell' ? 'Item do inventário' : 'Item'}
                  </option>
                  {(marketDraft.side === 'sell'
                    ? sellItemChoices
                    : MARKET_CATALOG.map(
                        (row) =>
                          [row.templateId, { name: row.name, quantity: 0 }] as [
                            string,
                            { name: string; quantity: number },
                          ],
                      )
                  ).map(([templateId, row]) => (
                    <option key={templateId} value={templateId}>
                      {marketDraft.side === 'sell'
                        ? `${row.name} ×${row.quantity}`
                        : row.name}
                    </option>
                  ))}
                </select>
                <input
                  name="price"
                  type="number"
                  min={1}
                  aria-label="Preço"
                  value={marketDraft.price}
                  onChange={(e) =>
                    setMarketDraft((draft) => ({ ...draft, price: e.target.value }))
                  }
                />
                <input
                  name="qty"
                  type="number"
                  min={1}
                  aria-label="Quantidade"
                  value={marketDraft.qty}
                  onChange={(e) =>
                    setMarketDraft((draft) => ({ ...draft, qty: e.target.value }))
                  }
                />
                <button type="submit">Publicar</button>
              </form>
              <ul>
                {(marketOrders ?? [])
                  .filter((o) => o.quantity > 0)
                  .map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        className="game-inline-nav"
                        onClick={() =>
                          setMarketDraft({
                            side: o.side === 'sell' ? 'buy' : 'sell',
                            templateId: o.templateId,
                            price: String(o.unitPrice),
                            qty: String(o.quantity),
                          })
                        }
                      >
                        {o.side === 'buy' ? 'Compra' : 'Venda'}{' '}
                        {getMarketCatalogEntry(o.templateId)?.name ?? o.templateId} ×{o.quantity} @{' '}
                        {o.unitPrice}c
                      </button>
                      {o.ownerId === character.id ? (
                        <>
                          {' '}
                          <button type="button" onClick={() => cancelMarketOrder(o.id)}>
                            Cancelar
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
              </ul>
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
          <h3>Expansão de fronteira</h3>
          <div className="game-contract-card">
            <p className="game-muted">
              O Quartel manda um esquadrão limpar o hex. Dois voluntários,
              mais o Guarda Capitão e dois guardas.
            </p>
            {expansionEnsureHint ? (
              <p className="game-muted" role="status">
                {expansionEnsureHint}
              </p>
            ) : openExpansionContract ? (
              <>
                <p>
                  Hex alvo{' '}
                  <code className="game-hex-code">
                    {openExpansionContract.targetHexId}
                  </code>
                </p>
                <p className="game-muted">
                  Voluntários{' '}
                  {openExpansionContract.enlistedCharacterIds.length}/
                  {openExpansionContract.charSlots} · custo{' '}
                  {openExpansionContract.staminaCost} STA por alistamento
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
                    if (!r.completed) {
                      setExpansionEnlistFeedback(
                        'Alistado. Falta mais um voluntário para a limpeza.',
                      );
                      return;
                    }
                    setExpansionEnlistFeedback(
                      r.outcome === 'victory'
                        ? r.nestDiscovered
                          ? 'Hex limpo — ninho descoberto. O Quartel abriu uma ofensiva.'
                          : 'Hex limpo. A fronteira abriu.'
                        : 'A limpeza falhou. O esquadrão voltou ao Centro. O contrato segue aberto.',
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
                  Alistar ({openExpansionContract.staminaCost} STA)
                </button>
                {openExpansionContract.enlistedCharacterIds.includes(
                  character.id,
                ) ? (
                  <p className="game-muted">Você já está neste contrato.</p>
                ) : null}
              </>
            ) : (
              <p className="game-muted">Nenhum contrato de expansão aberto.</p>
            )}
            {expansionEnlistFeedback ? (
              <p className="game-contract-feedback" role="status">
                {expansionEnlistFeedback}
              </p>
            ) : null}
          </div>
          <h3>Ofensiva ao ninho</h3>
          <div className="game-contract-card">
            <p className="game-muted">
              Issued by <strong>Quartel General</strong>
            </p>
            {openOffensiveContract ? (
              <>
                <p>
                  Target nest{' '}
                  <code className="game-hex-code">
                    {openOffensiveContract.targetHexId}
                  </code>
                </p>
                <p className="game-muted">
                  Volunteers{' '}
                  {openOffensiveContract.enlistedCharacterIds.length}/
                  {openOffensiveContract.charSlots} · {OFFENSIVE_CONTRACT_STA_COST}{' '}
                  STA per enlist · city threat {cityThreatLevel.toFixed(1)}
                </p>
                <p className="game-muted">
                  Nest cover buffs robots while the structure stands. Damage to
                  the nest cuts nightly wave threat.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!openOffensiveContract) return;
                    const r = enlistInOffensiveContract(
                      openOffensiveContract.id,
                      character.id,
                      Date.now(),
                    );
                    setOffensiveFeedback(
                      r.ok ? 'Enlisted on the offensive.' : r.error,
                    );
                  }}
                  disabled={
                    openOffensiveContract.enlistedCharacterIds.includes(
                      character.id,
                    ) ||
                    openOffensiveContract.enlistedCharacterIds.length >=
                      openOffensiveContract.charSlots ||
                    character.stamina.current <
                      openOffensiveContract.staminaCost ||
                    character.health.current <= 0
                  }
                >
                  Enlist ({OFFENSIVE_CONTRACT_STA_COST} STA)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!openOffensiveContract) return;
                    const r = startOffensiveSortieUi(openOffensiveContract.id);
                    setOffensiveFeedback(
                      r.ok ? null : r.error,
                    );
                  }}
                  disabled={
                    openOffensiveContract.enlistedCharacterIds.length <
                    OFFENSIVE_CONTRACT_CHAR_SLOTS
                  }
                >
                  Start sortie ({OFFENSIVE_CONTRACT_CHAR_SLOTS} required)
                </button>
                {openOffensiveContract.enlistedCharacterIds.includes(
                  character.id,
                ) ? (
                  <p className="game-muted">You are already on this offensive.</p>
                ) : null}
                {offensiveFeedback ? (
                  <p className="game-contract-feedback" role="status">
                    {offensiveFeedback}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="game-muted">
                No offensive posted. Unlock the hidden nest hex via frontier
                expansion to enable this contract.
              </p>
            )}
          </div>
          <p>
            Local time <strong>{formatTime(new Date(now))}</strong> · event
            hour {DEFENSE_START_HOUR}:00 — auto-starts at{' '}
            {DEFENSE_START_HOUR}:00 if still idle (you can Start earlier manually).
          </p>
          <p className="game-muted">
            Day {dailyDefense.date} · game day index {dailyDefense.gameDayIndex}{' '}
            · wave threat {dailyDefense.totalEnemyPoints} · city threat{' '}
            {cityThreatLevel.toFixed(1)} · phase{' '}
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
                Tonight&apos;s push targets sector wall at hex{' '}
                <strong>{dailyDefense.targetHexId}</strong>.
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
              The fight resolves in one pass. The feed plays it back.
            </p>
          ) : null}
          {dailyDefense.defenderLine.length > 0 ? (
            <ul className="game-combatant-list">
              {dailyDefense.defenderLine.map((d) => (
                <li key={d.characterId}>
                  {d.name}: {d.currentHp}/{d.maxHp} HP
                  {d.retreated ? ' (fell back)' : ''}
                </li>
              ))}
            </ul>
          ) : null}
          <h3>Sector wall ({dailyDefense.targetHexId})</h3>
          {targetWallFeature ? (
            <div className="game-wall-bar">
              <meter
                value={targetWallFeature.currentHp}
                min={0}
                max={targetWallFeature.maxHp}
              />{' '}
              {displayEconomicDecreasing(targetWallFeature.currentHp)}/
              {displayEconomicIncreasing(targetWallFeature.maxHp)}
              {targetWallFeature.currentHp <= 0 ? ' (breached)' : ''}
              <button
                type="button"
                className="game-inline-nav"
                onClick={() => payForWallRepair()}
                disabled={
                  targetWallFeature.currentHp >= targetWallFeature.maxHp - 0.000_001 ||
                  character.creds < WALL_REPAIR_CREDS_COST
                }
              >
                Repair (+{WALL_REPAIR_INTEGRITY_PER_ACTION}, {WALL_REPAIR_CREDS_COST}c)
              </button>
            </div>
          ) : (
            <p className="game-muted">No wall data for this sector yet.</p>
          )}
          <h3>Combat log</h3>
          {showDefenseCombatModal ? (
            <p className="game-muted" role="status">
              Live fight is running in the combat theater overlay (full screen).
            </p>
          ) : (
            <CombatLogTurnTabPanel
              fullLog={dailyDefense.combatLog}
              visibleEntries={dailyDefense.combatLog}
              resetKey={`defense-inline-${dailyDefense.date}-${String(dailyDefense.currentTurn)}-${dailyDefense.combatLog.length}`}
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
          <h3>Crônica da cidade</h3>
          <p className="game-muted">
            O Velho guarda logs relevantes da run — descobertas, oficiais do
            Quartel, e o que a rua ainda vai acrescentar.
          </p>
          {chronicle.length === 0 ? (
            <p className="game-muted">Nenhum registro ainda.</p>
          ) : (
            <ul className="game-lore-list" aria-label="City chronicle">
              {[...chronicle].reverse().map((entry) => (
                <li key={entry.id}>
                  <span className="game-muted">
                    {new Date(entry.at).toLocaleString()}
                  </span>
                  {' — '}
                  {entry.text}
                </li>
              ))}
            </ul>
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
              <strong>Work</strong> is available on a hex with a business you own
              or a public site, such as the city farm.
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
                        Owned — construir ({BUILDING_CONSTRUCTION_SUPPLIES_COST} materiais):{' '}
                        {playerBuildableCatalog().map((def) => (
                          <button
                            key={def.id}
                            type="button"
                            disabled={
                              inventoryTemplateQty('construction_supplies') <
                              BUILDING_CONSTRUCTION_SUPPLIES_COST
                            }
                            onClick={() =>
                              establishBusiness(
                                character.currentHexId,
                                slot.id,
                                def.id,
                              )
                            }
                          >
                            {def.name}
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
                    const def = getBuildingDef(b.buildingId);
                    const hasClaim = Object.values(b.passiveItemBuffer).some(
                      (q) => q > 0.000_001,
                    );
                    const owns = slot.ownedBy === character.id;
                    return (
                      <div className="game-business-panel">
                        <span className="game-muted">
                          {' '}
                          — {b.name} (Lv {b.level}) · workers {b.workersAssigned}/
                          {b.workerSlots} · wage {b.wagePerDay}c/day
                          {b.public ? ` · público ${Math.round(b.publicWorkTax * 100)}%` : ''}
                          {def?.role === 'housing' ? ` · ${def.housingSlots} moradias` : ''}
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
                          {def && def.recipes.length > 1 && owns ? (
                            <label className="game-business-recipe">
                              Receita:{' '}
                              <select
                                value={b.recipeId}
                                onChange={(e) =>
                                  setBusinessRecipe(
                                    character.currentHexId,
                                    slot.id,
                                    e.target.value,
                                  )
                                }
                              >
                                {def.recipes.map((recipe) => (
                                  <option key={recipe.id} value={recipe.id}>
                                    {recipe.outputs.map((o) => o.templateId).join(', ') || recipe.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {def?.id === 'hospital' ? (
                            <button type="button" onClick={cureAtHospital}>
                              Cura ({HOSPITAL_CURE_HP} HP, {HOSPITAL_CURE_CREDS}c)
                            </button>
                          ) : null}
                          {owns ? (
                            <label className="game-business-recipe">
                              Público{' '}
                              <input
                                type="checkbox"
                                checked={b.public}
                                onChange={(e) =>
                                  setBusinessPublic(
                                    character.currentHexId,
                                    slot.id,
                                    e.target.checked,
                                    Math.round(b.publicWorkTax * 100),
                                  )
                                }
                              />
                              taxa %
                              <input
                                type="number"
                                min={0}
                                max={100}
                                defaultValue={Math.round(b.publicWorkTax * 100)}
                                onBlur={(e) =>
                                  setBusinessPublic(
                                    character.currentHexId,
                                    slot.id,
                                    b.public,
                                    Number(e.target.value),
                                  )
                                }
                              />
                            </label>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              hireWorker(character.currentHexId, slot.id)
                            }
                            disabled={!owns || !(workerPoolFree > 0 && b.workersAssigned < b.workerSlots)}
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
              {skirmishSession.characterName} · 1 tick = 0.1s
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
              <div className="game-combat-hud__row">
                <span>{skirmishSession.enemyLabel}</span>
                <strong>
                  {skirmishSession.enemyHp}/{skirmishSession.enemyMaxHp}
                </strong>
              </div>
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
              {skirmishReveal.pendingApprox > 0 ? (
                <button
                  type="button"
                  className="game-combat-modal__secondary"
                  onClick={() => skirmishReveal.flushPending()}
                >
                  Show all lines now
                </button>
              ) : null}
              {skirmishReveal.pendingApprox === 0 ? (
                <>
                  {skirmishSession.outcome === 'win' ? (
                    <p className="game-skirmish-result">
                      Victory — +{STREET_SKIRMISH_SCRAP_REWARD_QTY} scrap metal, +
                      {STREET_SKIRMISH_WIN_SCORE} score (already applied).
                    </p>
                  ) : skirmishSession.outcome === 'loss' ? (
                    <p className="game-skirmish-result">
                      You went down. Heal up and keep patrolling.
                    </p>
                  ) : (
                    <p className="game-skirmish-result">
                      Stalemate — the street goes quiet.
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
          <h3>Battle feed</h3>
          <CombatLogTurnTabPanel
            fullLog={skirmishSession.combatLog}
            visibleEntries={skirmishReveal.visibleEntries}
            resetKey={skirmishRevealKey}
            listClassName="game-combat-log--theater"
            autoScroll
          />
        </CombatModal>
      ) : null}

      {offensiveSession ? (
        <CombatModal
          open
          title="Ofensiva ao ninho"
          subtitle={
            <>
              Nest {offensiveSession.nestHexId} · outcome{' '}
              <strong>{offensiveSession.outcome}</strong>
              {offensiveSession.threatReduced > 0.05 ? (
                <>
                  {' '}
                  · threat −{offensiveSession.threatReduced.toFixed(1)} (now{' '}
                  {offensiveSession.cityThreatAfter.toFixed(1)})
                </>
              ) : null}
            </>
          }
          hud={
            <div className="game-combat-hud">
              <p className="game-muted">
                Force returns to Centro after the sortie. Nest cover buffed
                robots while the structure stood.
              </p>
            </div>
          }
          footer={
            <>
              {offensiveReveal.pendingApprox > 0 ? (
                <button
                  type="button"
                  className="game-combat-modal__secondary"
                  onClick={() => offensiveReveal.flushPending()}
                >
                  Show all lines now
                </button>
              ) : null}
              {offensiveReveal.pendingApprox === 0 ? (
                <>
                  <p className="game-skirmish-result">
                    {offensiveSession.outcome === 'victory'
                      ? 'Nest core offline. City threat eased — nights should hit softer.'
                      : offensiveSession.outcome === 'interrupted'
                        ? 'All attackers retreated. Attack interrupted; force is back in the city.'
                        : 'Attack force broken. Nest still presses the city.'}
                  </p>
                  <button type="button" onClick={() => dismissOffensiveSession()}>
                    Close
                  </button>
                </>
              ) : null}
            </>
          }
        >
          <h3>Battle feed</h3>
          <CombatLogTurnTabPanel
            fullLog={offensiveSession.combatLog}
            visibleEntries={offensiveReveal.visibleEntries}
            resetKey={offensiveRevealKey}
            listClassName="game-combat-log--theater"
            autoScroll
          />
        </CombatModal>
      ) : null}

      {expansionSession ? (
        <CombatModal
          open
          title="Limpeza de fronteira"
          subtitle={
            <>
              Hex {expansionSession.targetHexId} ·{' '}
              <strong>{expansionSession.outcome}</strong> · 1 tick = 0.1s
            </>
          }
          footer={
            <>
              {expansionReveal.pendingApprox > 0 ? (
                <button
                  type="button"
                  className="game-combat-modal__secondary"
                  onClick={() => expansionReveal.flushPending()}
                >
                  Mostrar tudo
                </button>
              ) : (
                <button type="button" onClick={() => dismissExpansionSession()}>
                  Fechar
                </button>
              )}
            </>
          }
        >
          <h3>Batalha</h3>
          <CombatLogTurnTabPanel
            fullLog={expansionLog}
            visibleEntries={expansionReveal.visibleEntries}
            resetKey={expansionRevealKey}
            listClassName="game-combat-log--theater"
            autoScroll
          />
        </CombatModal>
      ) : null}

      {replayEntry ? (
        <CombatModal
          open
          title={replayEntry.title}
          subtitle={
            <>
              {replayEntry.kind} · <strong>{replayEntry.outcome}</strong> ·
              replay
            </>
          }
          footer={
            <>
              {replayReveal.pendingApprox > 0 ? (
                <button
                  type="button"
                  className="game-combat-modal__secondary"
                  onClick={() => replayReveal.flushPending()}
                >
                  Mostrar tudo
                </button>
              ) : (
                <button type="button" onClick={() => setReplayId(null)}>
                  Fechar
                </button>
              )}
            </>
          }
        >
          <h3>Replay</h3>
          <CombatLogTurnTabPanel
            fullLog={replayLog}
            visibleEntries={replayReveal.visibleEntries}
            resetKey={replayRevealKey}
            listClassName="game-combat-log--theater"
            autoScroll
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
              threat {dailyDefense.totalEnemyPoints} · 1 tick = 0.1s · phase{' '}
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
              <div className="game-combat-hud__grid">
                <div>
                  <span className="game-muted">Wave</span>
                  <strong>{dailyDefense.currentTurn}</strong>
                </div>
                <div>
                  <span className="game-muted">Wall hex</span>
                  <strong>{dailyDefense.targetHexId}</strong>
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
                  {dailyDefense.outcome === 'prefeitura_siege'
                    ? 'Prefeitura (Centro)'
                    : `Wall (${dailyDefense.targetHexId})`}
                </span>
                {dailyDefense.outcome === 'prefeitura_siege' ? (
                  centerCityHallFeature ? (
                    <meter
                      value={centerCityHallFeature.currentHp}
                      min={0}
                      max={centerCityHallFeature.maxHp}
                    />
                  ) : (
                    <span className="game-muted">—</span>
                  )
                ) : targetWallFeature ? (
                  <meter
                    value={targetWallFeature.currentHp}
                    min={0}
                    max={targetWallFeature.maxHp}
                  />
                ) : (
                  <span className="game-muted">—</span>
                )}
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
              <ul className="game-combatant-list">
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
              <ul className="game-combatant-list">
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
              Resolving the fight… lines appear ~ every {String(Math.round(COMBAT_UI_LOG_LINE_MS / 1000))}s.
            </p>
          ) : null}
          <h3>Battle feed</h3>
          <CombatLogTurnTabPanel
            fullLog={dailyDefense.combatLog}
            visibleEntries={defenseReveal.visibleEntries}
            resetKey={defenseCombatSessionKey}
            listClassName="game-combat-log--theater"
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
                  <ul className="game-combatant-list">
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
