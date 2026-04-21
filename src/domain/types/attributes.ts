/**
 * Core character attributes (autobattle / progression). MVP: all default to 1.
 */

export type CoreAttributeKey =
  | 'strength'
  | 'agility'
  | 'intelligence'
  | 'vitality'
  | 'charisma'
  | 'willpower';

export interface CoreAttributes {
  strength: number;
  agility: number;
  intelligence: number;
  vitality: number;
  charisma: number;
  willpower: number;
}

export const DEFAULT_CORE_ATTRIBUTES: CoreAttributes = {
  strength: 1,
  agility: 1,
  intelligence: 1,
  vitality: 1,
  charisma: 1,
  willpower: 1,
};
