import {
  OFFENSIVE_CONTRACT_CHAR_SLOTS,
  OFFENSIVE_CONTRACT_STA_COST,
  NPC_OWNER_QUARTEL,
} from '../domain/constants.ts';
import { makeContractId } from '../domain/ids.ts';
import {
  applyNestDiscoveryToMap,
  nestDiscoveryChronicleText,
  normalizeHexMapNestIntel,
} from '../domain/nestIntel.ts';
import type { Contract, HexMap } from '../domain/types/index.ts';
import { useCityStore } from '../stores/useCityStore.ts';
import { useContractsStore } from '../stores/useContractsStore.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';
import { useWorldStore } from '../stores/useWorldStore.ts';

export function findOpenOffensiveContract(
  contracts: Record<string, Contract>,
): Contract | null {
  for (const c of Object.values(contracts)) {
    if (c.type === 'offensive' && c.status === 'open') return c;
  }
  return null;
}

/**
 * Posts one open offensive contract for the nest if none is open.
 * Returns the open contract (existing or newly posted).
 */
export function ensureOffensiveContract(nestHexId: string): Contract {
  const { contracts, upsertContract } = useContractsStore.getState();
  const existing = findOpenOffensiveContract(contracts);
  if (existing) return existing;

  const meta = useMetaStore.getState();
  const n = meta.nextIds.contract + 1;
  const id = makeContractId(n);
  const now = Date.now();

  const contract: Contract = {
    id,
    type: 'offensive',
    ownerId: NPC_OWNER_QUARTEL,
    targetHexId: nestHexId,
    charSlots: OFFENSIVE_CONTRACT_CHAR_SLOTS,
    enlistedCharacterIds: [],
    staminaCost: OFFENSIVE_CONTRACT_STA_COST,
    status: 'open',
    createdAt: now,
  };

  useMetaStore.getState().patchNextIds({ contract: n });
  upsertContract(contract);
  return contract;
}

export type NestDiscoveryResult =
  | { discovered: false }
  | { discovered: true; nestHexId: string; contract: Contract };

/**
 * If the nest hex was just unlocked (or already unlocked pending discovery),
 * mark discovered, post offensive, append chronicle. Idempotent.
 */
export function maybeDiscoverNestAfterUnlock(
  hexMap: HexMap,
  unlockedHexId: string,
  nowMs: number = Date.now(),
): NestDiscoveryResult {
  if (hexMap.enemyNestDiscovered) return { discovered: false };
  if (!hexMap.nestHexId || unlockedHexId !== hexMap.nestHexId) {
    return { discovered: false };
  }

  const discoveredMap = applyNestDiscoveryToMap(hexMap);
  if (!discoveredMap) return { discovered: false };

  useWorldStore.getState().setHexMap(discoveredMap);
  const nestHexId = discoveredMap.nestHexId!;
  const contract = ensureOffensiveContract(nestHexId);
  useCityStore
    .getState()
    .appendChronicle(nestDiscoveryChronicleText(nestHexId), nowMs);

  return { discovered: true, nestHexId, contract };
}

/**
 * Bootstrap / migrate: fill nest fields; if nest already unlocked, fire discovery once.
 */
export function normalizeWorldNestIntel(rng: () => number = Math.random): void {
  const hexMap = useWorldStore.getState().hexMap;
  if (!hexMap) return;

  const { hexMap: normalized, pendingDiscovery } = normalizeHexMapNestIntel(
    hexMap,
    rng,
  );
  useWorldStore.getState().setHexMap(normalized);

  if (pendingDiscovery && normalized.nestHexId) {
    maybeDiscoverNestAfterUnlock(normalized, normalized.nestHexId);
  } else if (
    normalized.enemyNestDiscovered &&
    normalized.nestHexId &&
    !findOpenOffensiveContract(useContractsStore.getState().contracts)
  ) {
    ensureOffensiveContract(normalized.nestHexId);
  }
}
