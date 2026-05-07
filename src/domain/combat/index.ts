export { simulateBattle } from './core/simulate.ts';

export type {
  BattleId,
  CanonicalEvent,
  SchemaVersion,
  SkillId,
  StatusId,
  TeamId,
  TileId,
  UnitId,
  UnitRole,
} from './core/events.ts';
export type {
  BattleInput,
  BattleResult,
  BattleStateSummary,
  BattleStatsSummary,
  UnitSpec,
} from './core/types.ts';

export { softHexGrid } from './grid/softHexGrid.ts';
export type { IHexGrid } from './grid/IHexGrid.ts';

