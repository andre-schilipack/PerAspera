import { algoProgramFromLoadout } from '../domain/combat/ai/algoProgram.ts';
import {
  CENTER_HEX_ID,
  EXPANSION_CONTRACT_CHAR_SLOTS,
  EXPANSION_CONTRACT_STA_COST,
  NPC_OWNER_QUARTEL,
} from '../domain/constants.ts';
import { defenderBucketForLineIndex } from '../domain/defenseTactics.ts';
import {
  resolveExpansionClearBattle,
  type ExpansionClearOutcome,
  type ExpansionFighterResult,
  type ExpansionFighterSpec,
} from '../domain/expansionClearBattle.ts';
import { dangerIntegrityForRingDistance } from '../domain/hexDangerIntegrity.ts';
import {
  axialDistance,
  axialNeighbors,
  hexKeyFromAxial,
  type AxialCoord,
} from '../domain/hex.ts';
import { makeContractId } from '../domain/ids.ts';
import type { BattleReel } from '../domain/types/battleArchive.ts';
import type { Contract, HexMap, HexTile } from '../domain/types/index.ts';
import { useBattleArchiveStore } from '../stores/useBattleArchiveStore.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { useExpansionStore } from '../stores/useExpansionStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';
import { recordBattleReel } from './battleArchive.ts';
import { maybeDiscoverNestAfterUnlock } from './nestDiscovery.ts';

const ORIGIN: AxialCoord = { q: 0, r: 0 };

export function computeHexMapSizeLabel(hexes: Record<string, HexTile>): number {
  let maxD = 0;
  for (const h of Object.values(hexes)) {
    const d = axialDistance(h.coordinates, ORIGIN);
    if (d > maxD) maxD = d;
  }
  return maxD * 2 + 1;
}

/**
 * Among locked hexes, pick those at minimal axial distance from origin; random tie-break.
 */
export function pickExpansionTargetHex(hexMap: HexMap): string | null {
  const locked = Object.values(hexMap.hexes).filter((h) => !h.isUnlocked);
  if (locked.length === 0) return null;

  let minD = Infinity;
  const byDist: HexTile[] = [];
  for (const h of locked) {
    const d = axialDistance(h.coordinates, ORIGIN);
    if (d < minD) {
      minD = d;
      byDist.length = 0;
      byDist.push(h);
    } else if (d === minD) {
      byDist.push(h);
    }
  }
  const pick = byDist[Math.floor(Math.random() * byDist.length)];
  return pick?.id ?? null;
}

function findOpenExpansionContract(
  contracts: Record<string, Contract>,
): Contract | null {
  for (const c of Object.values(contracts)) {
    if (c.type === 'expansion' && c.status === 'open') return c;
  }
  return null;
}

/**
 * Ensures one open expansion contract exists (Quartel). Call when opening Defense at Centro.
 */
export function ensureExpansionContract(): {
  contract: Contract | null;
  reason: 'ok' | 'no_locked_hex';
} {
  const hexMap = useWorldStore.getState().hexMap;
  if (!hexMap) return { contract: null, reason: 'no_locked_hex' };

  const { contracts, upsertContract } = useContractsStore.getState();
  const existing = findOpenExpansionContract(contracts);
  if (existing) return { contract: existing, reason: 'ok' };

  const targetHexId = pickExpansionTargetHex(hexMap);
  if (!targetHexId) return { contract: null, reason: 'no_locked_hex' };

  const meta = useMetaStore.getState();
  const n = meta.nextIds.contract + 1;
  const id = makeContractId(n);
  const now = Date.now();

  const contract: Contract = {
    id,
    type: 'expansion',
    ownerId: NPC_OWNER_QUARTEL,
    targetHexId,
    charSlots: EXPANSION_CONTRACT_CHAR_SLOTS,
    enlistedCharacterIds: [],
    staminaCost: EXPANSION_CONTRACT_STA_COST,
    status: 'open',
    createdAt: now,
  };

  useMetaStore.getState().patchNextIds({ contract: n });
  upsertContract(contract);
  return { contract, reason: 'ok' };
}

export type EnlistExpansionResult =
  | { ok: true; completed: false }
  | {
      ok: true;
      completed: true;
      outcome: ExpansionClearOutcome;
      nestDiscovered: boolean;
    }
  | { ok: false; error: string };

export function commitExpansionClear(params: {
  contractId: string;
  outcome: ExpansionClearOutcome;
  fighters: readonly ExpansionFighterResult[];
  nowMs: number;
}): { nestDiscovered: boolean } {
  const failed = params.outcome !== 'victory';
  for (const fighter of params.fighters) {
    const ch = useCharactersStore.getState().characters[fighter.characterId];
    if (!ch) continue;
    useCharactersStore.getState().updateCharacter(fighter.characterId, {
      health: {
        current: Math.max(0, Math.min(fighter.maxHp, fighter.currentHp)),
        max: fighter.maxHp,
        lastUpdated: params.nowMs,
      },
      ...(failed ? { currentHexId: CENTER_HEX_ID } : {}),
    });
  }

  if (failed) {
    useContractsStore.getState().patchContract(params.contractId, {
      status: 'open',
      enlistedCharacterIds: [],
    });
    return { nestDiscovered: false };
  }

  const contract = useContractsStore.getState().contracts[params.contractId];
  if (!contract) return { nestDiscovered: false };
  return { nestDiscovered: applyExpansionUnlock(contract) };
}

export function enlistInExpansionContract(
  contractId: string,
  characterId: string,
  nowMs: number,
  rng: () => number = Math.random,
): EnlistExpansionResult {
  const contract = useContractsStore.getState().contracts[contractId];
  if (!contract || contract.type !== 'expansion' || contract.status !== 'open') {
    return { ok: false, error: 'Contrato inválido ou fechado.' };
  }

  const ch = useCharactersStore.getState().characters[characterId];
  if (!ch) return { ok: false, error: 'Personagem não encontrado.' };

  if (contract.enlistedCharacterIds.includes(characterId)) {
    return { ok: false, error: 'Já alistado neste contrato.' };
  }
  if (contract.enlistedCharacterIds.length >= contract.charSlots) {
    return { ok: false, error: 'Contrato cheio.' };
  }
  if (ch.stamina.current < contract.staminaCost) {
    return { ok: false, error: 'STA insuficiente.' };
  }

  useCharactersStore.getState().updateCharacter(characterId, {
    stamina: {
      ...ch.stamina,
      current: ch.stamina.current - contract.staminaCost,
      lastUpdated: nowMs,
    },
  });

  const enlistedCharacterIds = [...contract.enlistedCharacterIds, characterId];
  useContractsStore.getState().patchContract(contractId, { enlistedCharacterIds });

  const updated = useContractsStore.getState().contracts[contractId];
  if (!updated) return { ok: false, error: 'Estado do contrato perdido.' };

  if (enlistedCharacterIds.length >= updated.charSlots) {
    return launchExpansionClear(updated, characterId, nowMs, rng);
  }

  return { ok: true, completed: false };
}

function launchExpansionClear(
  contract: Contract,
  viewerCharacterId: string,
  nowMs: number,
  rng: () => number,
): EnlistExpansionResult {
  const hexMap = useWorldStore.getState().hexMap;
  const target = hexMap?.hexes[contract.targetHexId];
  if (!target) return { ok: false, error: 'Hex alvo sumiu do mapa.' };

  const fighters: ExpansionFighterSpec[] = [];
  contract.enlistedCharacterIds.forEach((id, lineIndex) => {
    const ch = useCharactersStore.getState().characters[id];
    if (!ch) return;
    const skillIds =
      ch.combatLoadout?.skillIds != null && ch.combatLoadout.skillIds.length > 0
        ? [...ch.combatLoadout.skillIds]
        : undefined;
    fighters.push({
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
  });

  const distanceFromCenter = axialDistance(target.coordinates, ORIGIN);
  const resolved = resolveExpansionClearBattle({
    battleId: `expansion:${contract.id}:${String(nowMs)}`,
    distanceFromCenter,
    fighters,
    rng,
    nowMs,
  });

  const { nestDiscovered } = commitExpansionClear({
    contractId: contract.id,
    outcome: resolved.outcome,
    fighters: resolved.fighters,
    nowMs,
  });

  const reel: BattleReel = {
    kind: 'expansion',
    at: nowMs,
    title: `Limpeza · ${contract.targetHexId}`,
    outcome: resolved.outcome,
    participantCharacterIds: [...contract.enlistedCharacterIds],
    unitNames: resolved.unitNames,
    battleResult: resolved.battleResult,
  };
  const archiveId = recordBattleReel(reel);
  useBattleArchiveStore.getState().markSeen(archiveId, viewerCharacterId);
  useExpansionStore.getState().openSession({
    contractId: contract.id,
    targetHexId: contract.targetHexId,
    outcome: resolved.outcome,
    reel,
  });

  return { ok: true, completed: true, outcome: resolved.outcome, nestDiscovered };
}

/** @returns true when unlocking the target also discovered the robot nest. */
function applyExpansionUnlock(contract: Contract): boolean {
  const map = useWorldStore.getState().hexMap;
  if (!map) return false;

  const target = map.hexes[contract.targetHexId];
  if (!target) return false;

  const hexes: Record<string, HexTile> = { ...map.hexes };

  hexes[contract.targetHexId] = {
    ...target,
    isUnlocked: true,
  };

  const neighbors = axialNeighbors(
    target.coordinates.q,
    target.coordinates.r,
  );
  for (const n of neighbors) {
    const key = hexKeyFromAxial(n.q, n.r);
    if (hexes[key]) continue;

    const dist = axialDistance(n, ORIGIN);
    const { danger, integrity } = dangerIntegrityForRingDistance(dist);
    hexes[key] = {
      id: key,
      coordinates: { q: n.q, r: n.r },
      danger,
      integrity,
      placeSlots: [],
      isUnlocked: false,
    };
  }

  const size = computeHexMapSizeLabel(hexes);
  const nextMap: HexMap = {
    ...map,
    hexes,
    size,
  };
  useWorldStore.getState().setHexMap(nextMap);

  useContractsStore.getState().patchContract(contract.id, { status: 'completed' });

  const discovery = maybeDiscoverNestAfterUnlock(
    nextMap,
    contract.targetHexId,
  );
  return discovery.discovered;
}
