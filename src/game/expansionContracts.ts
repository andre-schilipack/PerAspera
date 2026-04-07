import {
  EXPANSION_CONTRACT_CHAR_SLOTS,
  EXPANSION_CONTRACT_STA_COST,
  NPC_OWNER_QUARTEL,
} from '../domain/constants.ts';
import { dangerIntegrityForRingDistance } from '../domain/hexDangerIntegrity.ts';
import {
  axialDistance,
  axialNeighbors,
  hexKeyFromAxial,
  type AxialCoord,
} from '../domain/hex.ts';
import { makeContractId } from '../domain/ids.ts';
import type { Contract, Hex, HexMap } from '../domain/types/index.ts';
import { useCharactersStore } from '../stores/useCharactersStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

const ORIGIN: AxialCoord = { q: 0, r: 0 };

export function computeHexMapSizeLabel(hexes: Record<string, Hex>): number {
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
  const byDist: Hex[] = [];
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
  | { ok: true; completed: boolean }
  | { ok: false; error: string };

export function enlistInExpansionContract(
  contractId: string,
  characterId: string,
  nowMs: number,
): EnlistExpansionResult {
  const contract = useContractsStore.getState().contracts[contractId];
  if (!contract || contract.type !== 'expansion' || contract.status !== 'open') {
    return { ok: false, error: 'Invalid or closed contract.' };
  }

  const ch = useCharactersStore.getState().characters[characterId];
  if (!ch) return { ok: false, error: 'Character not found.' };

  if (contract.enlistedCharacterIds.includes(characterId)) {
    return { ok: false, error: 'Already enlisted on this contract.' };
  }
  if (contract.enlistedCharacterIds.length >= contract.charSlots) {
    return { ok: false, error: 'Contract is full.' };
  }
  if (ch.stamina.current < contract.staminaCost) {
    return { ok: false, error: 'Not enough STA.' };
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
  if (!updated) return { ok: false, error: 'Contract state lost.' };

  if (enlistedCharacterIds.length >= updated.charSlots) {
    applyExpansionUnlock(updated);
    return { ok: true, completed: true };
  }

  return { ok: true, completed: false };
}

function applyExpansionUnlock(contract: Contract): void {
  const map = useWorldStore.getState().hexMap;
  if (!map) return;

  const target = map.hexes[contract.targetHexId];
  if (!target) return;

  const hexes: Record<string, Hex> = { ...map.hexes };

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
  useWorldStore.getState().setHexMap({
    ...map,
    hexes,
    size,
  });

  useContractsStore.getState().patchContract(contract.id, { status: 'completed' });
}
