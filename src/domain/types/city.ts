/**
 * City-wide simulation state (single-player / local save).
 * Numeric fields are real-valued; UI uses {@link ../economicDisplay.ts}.
 */
export interface CityCoreState {
  /** Remaining grid energy (arbitrary units). */
  energyCurrent: number;
  /** Maximum energy capacity (upgrades later). */
  energyMax: number;
  /** Net energy added per economic tick before consumption. */
  energyGenerationPerTick: number;
  /** Baseline city consumption per economic tick. */
  energyConsumptionPerTick: number;
  /**
   * 0–100: urban recovery / morale proxy; brownout chips it; future systems may raise it.
   */
  stabilityIndex: number;
}
