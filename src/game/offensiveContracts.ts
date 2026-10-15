import {
  CENTER_HEX_ID,
  OFFENSIVE_CONTRACT_CHAR_SLOTS,
  OFFENSIVE_CONTRACT_STA_COST,
} from '../domain/constants.ts';
import { algoProgramFromLoadout } from '../domain/combat/ai/algoProgram.ts';
import { defenderBucketForLineIndex } from '../domain/defenseTactics.ts';
import {
  resolveOffensiveNestBattle,
  type OffensiveAttackerSpec,
} from '../domain/offensiveFieldBattle.ts';
import { nestSortieChronicleText } from '../domain/nestIntel.ts';
import type { CombatLogEntry } from '../domain/types/combat.ts';
import type { Contract } from '../domain/types/contracts.ts';
import type { OffensiveSortieSession } from '../domain/types/offensive.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';
import { ensureOffensiveContract, findOpenOffensiveContract } from './nestDiscovery.ts';
import type { BattleReel } from '../domain/types/battleArchive.ts';
import { recordBattleReel } from './battleArchive.ts';
import { readCityThreatLevel } from './cityThreat.ts';

export type EnlistOffensiveResult =
  | { ok: true }
  | { ok: false; error: string };

export function enlistInOffensiveContract(
  contractId: string,
  characterId: string,
  nowMs: number = Date.now(),
): EnlistOffensiveResult {
  const contract = useContractsStore.getState().contracts[contractId];
  if (!contract || contract.type !== 'offensive' || contract.status !== 'open') {
    return { ok: false, error: 'Invalid or closed offensive contract.' };
  }

  const ch = useCharactersStore.getState().characters[characterId];
  if (!ch) return { ok: false, error: 'Character not found.' };

  if (contract.enlistedCharacterIds.includes(characterId)) {
    return { ok: false, error: 'Already enlisted on this offensive.' };
  }
  if (contract.enlistedCharacterIds.length >= contract.charSlots) {
    return { ok: false, error: 'Offensive roster is full.' };
  }
  if (ch.stamina.current < contract.staminaCost) {
    return { ok: false, error: 'Not enough STA.' };
  }
  if (ch.health.current <= 0) {
    return { ok: false, error: 'Character is down.' };
  }

  useCharactersStore.getState().updateCharacter(characterId, {
    stamina: {
      ...ch.stamina,
      current: ch.stamina.current - contract.staminaCost,
      lastUpdated: nowMs,
    },
  });

  useContractsStore.getState().patchContract(contractId, {
    enlistedCharacterIds: [...contract.enlistedCharacterIds, characterId],
  });

  return { ok: true };
}

export type StartOffensiveResult =
  | { ok: true; session: OffensiveSortieSession }
  | { ok: false; error: string };

/**
 * Resolve the nest sortie when roster >= charSlots (5). Applies HP, threat,
 * nest feature, returns force to Centro, reopens a fresh open offensive.
 */
export function startOffensiveSortie(
  contractId: string,
  nowMs: number = Date.now(),
  rng: () => number = Math.random,
): StartOffensiveResult {
  const contract = useContractsStore.getState().contracts[contractId];
  if (!contract || contract.type !== 'offensive' || contract.status !== 'open') {
    return { ok: false, error: 'Invalid or closed offensive contract.' };
  }
  if (contract.enlistedCharacterIds.length < OFFENSIVE_CONTRACT_CHAR_SLOTS) {
    return {
      ok: false,
      error: `Need ${String(OFFENSIVE_CONTRACT_CHAR_SLOTS)} characters to start.`,
    };
  }

  const hexMap = useWorldStore.getState().hexMap;
  if (!hexMap) return { ok: false, error: 'No world loaded.' };
  const nestHexId = contract.targetHexId;
  if (!hexMap.hexes[nestHexId]) {
    return { ok: false, error: 'Nest hex missing from the map.' };
  }

  const attackers: OffensiveAttackerSpec[] = [];
  let lineIndex = 0;
  for (const id of contract.enlistedCharacterIds) {
    const ch = useCharactersStore.getState().characters[id];
    if (!ch) continue;
    const skillIds =
      ch.combatLoadout?.skillIds != null && ch.combatLoadout.skillIds.length > 0
        ? [...ch.combatLoadout.skillIds]
        : undefined;
    attackers.push({
      characterId: id,
      name: ch.name,
      currentHp: ch.health.current,
      maxHp: ch.health.max,
      coreAttributes: ch.coreAttributes,
      skillIds,
      combatRole: ch.combatLoadout?.combatRole,
      algoProgram: algoProgramFromLoadout(ch.combatLoadout),
      tacticalBucket: defenderBucketForLineIndex(lineIndex),
    });
    lineIndex += 1;
  }

  if (attackers.length < OFFENSIVE_CONTRACT_CHAR_SLOTS) {
    return { ok: false, error: 'Not enough living characters on the roster.' };
  }

  const meta = useMetaStore.getState();
  const firstLogId = meta.nextIds.combatLogEntry + 1;
  const cityThreatBefore = readCityThreatLevel();

  const resolved = resolveOffensiveNestBattle({
    battleId: `offensive:${contractId}:${String(nowMs)}`,
    hexMap,
    nestHexId,
    attackers,
    cityThreatLevel: cityThreatBefore,
    rng,
    nowMs,
  });

  useWorldStore.getState().setHexMap(resolved.hexMap);
  useCityStore.getState().setCityThreatLevel(resolved.cityThreatAfter);
  useCityStore.getState().appendChronicle(
    nestSortieChronicleText({
      outcome: resolved.outcome,
      nestHexId,
      threatReduced: resolved.threatReduced,
    }),
    nowMs,
  );

  for (const a of resolved.attackers) {
    const ch = useCharactersStore.getState().characters[a.characterId];
    if (!ch) continue;
    useCharactersStore.getState().updateCharacter(a.characterId, {
      health: {
        current: Math.max(0, Math.min(a.maxHp, a.currentHp)),
        max: a.maxHp,
        lastUpdated: nowMs,
      },
      // Force returns to the city after sortie (retreat, win, or wipe survivors).
      currentHexId: CENTER_HEX_ID,
    });
  }

  useContractsStore.getState().patchContract(contractId, {
    status: 'completed',
    enlistedCharacterIds: [],
  });

  // Recurring single-target: keep one open offensive on the mural.
  ensureOffensiveContract(nestHexId);

  const combatLog: CombatLogEntry[] = resolved.combatLog.map((line, i) => ({
    ...line,
    id: firstLogId + i,
  }));
  const lastId =
    combatLog.length > 0
      ? combatLog[combatLog.length - 1]!.id
      : firstLogId;
  useMetaStore.getState().patchNextIds({ combatLogEntry: lastId });

  if (resolved.battleResult) {
    const reel: BattleReel = {
      kind: 'offensive',
      at: nowMs,
      title: `Ofensiva · ${nestHexId}`,
      outcome: resolved.outcome,
      participantCharacterIds: [...contract.enlistedCharacterIds],
      unitNames: resolved.unitNames ?? {},
      battleResult: resolved.battleResult,
    };
    recordBattleReel(reel);
  }

  const session: OffensiveSortieSession = {
    contractId,
    nestHexId,
    outcome: resolved.outcome,
    combatLog,
    threatReduced: resolved.threatReduced,
    cityThreatAfter: resolved.cityThreatAfter,
    nestHpAfter: resolved.nestHpAfter,
  };

  return { ok: true, session };
}

export function getOpenOffensiveContract(): Contract | null {
  return findOpenOffensiveContract(useContractsStore.getState().contracts);
}

/** Re-export enlist STA for UI. */
export { OFFENSIVE_CONTRACT_STA_COST };
