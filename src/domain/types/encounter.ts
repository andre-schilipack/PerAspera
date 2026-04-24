/**
 * Ally-side structural / civic targets in mass encounter combat.
 * The resolver uses this list to choose strike cycles and structural damage (not a separate "theater" enum).
 */
export type AlliedStructureType = 'wall' | 'city_hall';

export interface AlliedStructureWall {
  type: 'wall';
  /** Hex tile that holds the `wall` feature (e.g. nightly `targetHexId`). */
  hexId: string;
}

export interface AlliedStructureCityHall {
  type: 'city_hall';
  /** Tile with `city_hall` (typically {@link CENTER_HEX_ID} from constants). */
  hexId: string;
}

export type AlliedStructure = AlliedStructureWall | AlliedStructureCityHall;

/**
 * Per-round options for the shared encounter pipeline.
 * Omitted fields use defaults derived from {@link AlliedStructure} entries when sensible.
 */
export interface EncounterSessionConfig {
  /**
   * When true, defenders never fall back from the line (last stand).
   * When omitted, defaults to `true` if a `city_hall` structure is present, else `false`.
   */
  noRetreat?: boolean;
}
