/**
 * Canonical lore and copy for Robusto (Alpha). Edit here; UI imports strings.
 * Player-facing text — keep tone grounded cyberpunk / street survival.
 */

import { loreNpcNavigationTip } from './npcPlaces.ts';

export const GAME_TITLE = 'Robusto';

/** Year in-universe (setting anchor). */
export const SETTING_YEAR = 2050;

/**
 * Short paragraphs: city, collapse, tech, fantasy of the Score List.
 */
export const settingParagraphs: readonly string[] = [
  `Robusto, ${String(SETTING_YEAR)}. You are sixteen, stepping out from your parents' place — they lived through the Collapse of 2030. The city still stands, but tech has slipped backward: broken intranet, janky apps, and rust under neon.`,
  'Stamina is your daily fuel. You patrol the hex grid, hustle creds, run a corner business, and stack rare loot. At night the wall needs bodies — lock in for the Nightly Defense and push your name up the local Score List.',
  'There is no fair server: this save lives on your device. The legend is yours to grind.',
];

/**
 * Fixed terms for consistent UI and future i18n.
 */
export const glossary: readonly { term: string; description: string }[] = [
  { term: 'Creds', description: 'City credits — street money for lots, market, and repairs.' },
  { term: 'STA (Stamina)', description: 'Daily energy for patrol, work, research, and defense lock-in.' },
  {
    term: 'Ajuda na Defesa / Score',
    description: 'Contribution tracked for the Nightly Defense — climb the local Top 10.',
  },
  { term: 'Muralha', description: 'The wall around Robusto; sectors can breach if neglected.' },
  {
    term: 'Centro (downtown hex)',
    description:
      'City core hex — Municipal Market, Prefeitura, and Quartel General. You must be here to use those services.',
  },
  {
    term: 'Home hex',
    description:
      "Your parents' house and Velho Rabiscão (Top 10). Patrol home to read the Score List.",
  },
  {
    term: 'Mercado Municipal',
    description: 'NPC market with fixed prices — buy and sell basics.',
  },
  { term: 'Prefeitura', description: 'City hall — repairs and bureaucracy (future hooks).' },
  {
    term: 'Quartel General',
    description: 'Enlist for the city defense; nightly lock costs STA.',
  },
  {
    term: 'Velho Rabiscão',
    description: 'The historian — keeps the Score List and street memory (more activities later).',
  },
  {
    term: 'NPCs & screens',
    description: loreNpcNavigationTip,
  },
];

/** Three beats: spend STA → progress → night → score. */
export const coreLoopBullets: readonly string[] = [
  'Spend STA — patrol hexes, work your business, study, trade at the market.',
  'Earn creds, items, EXP, and reputation; make the district safer.',
  'Lock for the Nightly Defense (20:00) — raise your Score and chase the Top 10.',
];

/**
 * Lines shown on the new-game screen (before first character).
 */
export const startPitchLines: readonly string[] = [
  'Leave home at sixteen. Turn ash and scrap into a street legend.',
  'Local save — your progress stays on this device.',
];

/**
 * Optional hook for character creation copy.
 */
export const startSublineParents =
  'You start at your parents\' home hex — the city is shared; your run is yours.';
