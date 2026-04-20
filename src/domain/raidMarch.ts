import {
  CENTER_HEX_ID,
  DEFAULT_BUSINESS_STRUCTURE_MAX_HP,
  EMPTY_LOT_PRICE,
  HOME_HEX_ID,
  NPC_OWNER_CITY,
  RAID_THREAT_TO_BUSINESS_HP_DAMAGE,
} from './constants.ts';
import {
  axialDistance,
  axialNeighbors,
  hexKeyFromAxial,
  parseHexKey,
  type AxialCoord,
} from './hex.ts';
import type { HexMap, PlaceSlot } from './types/map.ts';

export interface RaidMarchResult {
  civilianPopulation: number;
  hexMap: HexMap;
  logLines: string[];
  /** P3: siege at Prefeitura — always false for P2 march-only (center hex skipped). */
  prefeituraDestroyed: boolean;
}

export function resolveRaidMarchTargetHex(
  targetHexId: string | undefined,
  hexMap: HexMap,
): string {
  const candidate = targetHexId ?? HOME_HEX_ID;
  if (hexMap.hexes[candidate]) return candidate;
  if (hexMap.hexes[HOME_HEX_ID]) return HOME_HEX_ID;
  const keys = Object.keys(hexMap.hexes);
  return keys[0] ?? candidate;
}

/** Greedy axial path following existing hex tiles toward goal (deterministic ties). */
export function buildHexRaidPath(
  startHexId: string,
  goalHexId: string,
  hexMap: HexMap,
): string[] {
  if (!hexMap.hexes[startHexId] || !hexMap.hexes[goalHexId]) {
    return hexMap.hexes[startHexId] ? [startHexId] : [];
  }
  if (startHexId === goalHexId) return [startHexId];

  const path: string[] = [];
  let current = startHexId;
  const maxSteps = Object.keys(hexMap.hexes).length + 4;
  const goalCoord = parseHexKey(goalHexId);
  if (!goalCoord) return [startHexId];

  for (let step = 0; step < maxSteps; step++) {
    path.push(current);
    if (current === goalHexId) break;

    const curCoord = parseHexKey(current);
    if (!curCoord) break;

    const candidates: { nk: string; d: number }[] = [];
    for (const n of axialNeighbors(curCoord.q, curCoord.r)) {
      const nk = hexKeyFromAxial(n.q, n.r);
      if (!hexMap.hexes[nk]) continue;
      candidates.push({ nk, d: axialDistance(n, goalCoord) });
    }
    candidates.sort((a, b) => a.d - b.d || a.nk.localeCompare(b.nk));
    const next = candidates[0]?.nk;
    if (next === undefined || next === current) break;
    current = next;
  }

  return path;
}

function applyBusinessStructureDamage(
  slot: PlaceSlot,
  damage: number,
): PlaceSlot {
  if (slot.type !== 'business' || !slot.business || damage <= 0) return slot;

  const max =
    slot.structureHp?.max ?? DEFAULT_BUSINESS_STRUCTURE_MAX_HP;
  const current = slot.structureHp?.current ?? max;
  const nextHp = Math.max(0, current - damage);

  if (nextHp === 0) {
    return {
      ...slot,
      type: 'ruin',
      business: undefined,
      structureHp: undefined,
      ownedBy: NPC_OWNER_CITY,
      priceToBuy: EMPTY_LOT_PRICE,
    };
  }

  return {
    ...slot,
    structureHp: { current: nextHp, max },
  };
}

/**
 * Post-breach march: threat count only drives structural damage to businesses along
 * the path from breach tile to downtown. Threat is not consumed; population is unchanged.
 * Center tile (Prefeitura siege) is deferred to P3 — skipped here.
 */
export function applyRaidMarch(params: {
  threatCount: number;
  civilianPopulation: number;
  hexMap: HexMap;
  targetHexId: string;
  centerHexId?: string;
  rng: () => number;
}): RaidMarchResult {
  void params.rng; // reserved for future stochastic destruction / ties
  const centerHexId = params.centerHexId ?? CENTER_HEX_ID;
  const resolvedTarget = resolveRaidMarchTargetHex(
    params.targetHexId,
    params.hexMap,
  );
  const path = buildHexRaidPath(resolvedTarget, centerHexId, params.hexMap);
  const threatCount = Math.max(0, params.threatCount);
  const hpDamagePerTile = Math.floor(
    threatCount * RAID_THREAT_TO_BUSINESS_HP_DAMAGE,
  );

  let hexMap = params.hexMap;
  const logLines: string[] = [];

  if (threatCount <= 0 || hpDamagePerTile <= 0) {
    return {
      civilianPopulation: params.civilianPopulation,
      hexMap,
      logLines,
      prefeituraDestroyed: false,
    };
  }

  for (const hexId of path) {
    if (hexId === centerHexId) continue;

    const hex = hexMap.hexes[hexId];
    if (!hex) continue;

    let structuralChange = false;
    const placeSlots = hex.placeSlots.map((slot) => {
      if (slot.type !== 'business' || !slot.business) return slot;
      const nextSlot = applyBusinessStructureDamage(slot, hpDamagePerTile);
      if (nextSlot !== slot) structuralChange = true;
      return nextSlot;
    });

    if (structuralChange) {
      hexMap = {
        ...hexMap,
        hexes: {
          ...hexMap.hexes,
          [hexId]: { ...hex, placeSlots },
        },
      };
      logLines.push(
        `Raid march: businesses on ${hexId} took ${String(
          hpDamagePerTile,
        )} structural HP (${String(threatCount)} threat).`,
      );
    }
  }

  return {
    civilianPopulation: params.civilianPopulation,
    hexMap,
    logLines,
    prefeituraDestroyed: false,
  };
}
