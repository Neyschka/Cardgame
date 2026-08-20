// Card definitions. Pure data — `resolve.ts` walks `effects[]`.
// `playAgain` is a card flag, not an effect: it changes turn flow, not state.

import type { CardEffect, DeckId } from '@card-game/shared';

export interface CardDef {
  id: string; // also the art filename: `${id}.svg`
  name: string;
  deck: DeckId;
  count: number;
  effects: CardEffect[];
  playAgain?: boolean; // after resolving, the same player takes another turn
  flavour: string;
  art: string;
}

export const DECK_SIZE = 15;

const dmg = (value: number): CardEffect => ({
  kind: 'attack',
  value,
  target: 'single',
});
const all = (value: number): CardEffect => ({
  kind: 'attack',
  value,
  target: 'all',
});
const shld = (value: number): CardEffect => ({
  kind: 'shield',
  value,
  target: 'single',
});
const heal = (value: number): CardEffect => ({
  kind: 'heal',
  value,
  target: 'single',
});
const draw = (value: number): CardEffect => ({
  kind: 'draw',
  value,
  target: 'single',
});
const strip = (value: number): CardEffect => ({
  kind: 'strip',
  value,
  target: 'single',
});

// ─────────────────────────────────────────────────────────────
// RED — Pyromancer. Burst, sweeps, shield-breaking, chains.
// Identity: highest ceiling, worst defence. Kills first or dies first.
// ─────────────────────────────────────────────────────────────
export const RED_DECK: CardDef[] = [
  {
    id: 'ember_bolt',
    name: 'Ember Bolt',
    deck: 'red',
    count: 3,
    effects: [dmg(2)],
    flavour: 'A spark, thrown well.',
    art: 'Small orange projectile trailing sparks',
  },

  {
    id: 'flame_lash',
    name: 'Flame Lash',
    deck: 'red',
    count: 2,
    effects: [dmg(3)],
    flavour: 'It curls back on the return.',
    art: 'Whip of fire in a coiled S-curve',
  },

  {
    id: 'firestorm',
    name: 'Firestorm',
    deck: 'red',
    count: 2,
    effects: [all(2)],
    flavour: 'No one is standing outside this.',
    art: 'Rain of embers across a wide horizon',
  },

  {
    id: 'immolate',
    name: 'Immolate',
    deck: 'red',
    count: 2,
    effects: [dmg(4)],
    flavour: 'Brief. Total.',
    art: 'Column of white-hot flame falling from above',
  },

  {
    id: 'kindle',
    name: 'Kindle',
    deck: 'red',
    count: 2,
    effects: [dmg(1)],
    playAgain: true,
    flavour: 'One catches the next.',
    art: 'Single ember splitting into two, upward motion',
  },

  {
    id: 'shatter',
    name: 'Shatter',
    deck: 'red',
    count: 2,
    effects: [strip(1), dmg(2)],
    flavour: 'Glass first, then the man.',
    art: 'Cracking blue shield with fire bursting through',
  },

  {
    id: 'cinder_ward',
    name: 'Cinder Ward',
    deck: 'red',
    count: 1,
    effects: [shld(1)],
    flavour: 'Ash holds, briefly.',
    art: 'Thin ring of floating embers',
  },

  {
    id: 'searing_mend',
    name: 'Searing Mend',
    deck: 'red',
    count: 1,
    effects: [dmg(1), heal(1)],
    flavour: 'Cauterise and continue.',
    art: 'Glowing brand against a wound, gold sparks',
  },
];

// ─────────────────────────────────────────────────────────────
// GREEN — Sylvan Ranger. Consistent damage, card advantage, no dead draws.
// Identity: never has a bad turn, never has a spectacular one.
// ─────────────────────────────────────────────────────────────
export const GREEN_DECK: CardDef[] = [
  {
    id: 'thornstrike',
    name: 'Thornstrike',
    deck: 'green',
    count: 4,
    effects: [dmg(2)],
    flavour: 'The wood bites back.',
    art: 'Barbed vine lashing forward, thorns catching light',
  },

  {
    id: 'hunters_mark',
    name: "Hunter's Mark",
    deck: 'green',
    count: 2,
    effects: [dmg(3)],
    flavour: 'Chosen before drawn.',
    art: 'Arrow in flight, glowing green sigil on the shaft',
  },

  {
    id: 'barbed_volley',
    name: 'Barbed Volley',
    deck: 'green',
    count: 2,
    effects: [all(1)],
    flavour: 'Loose.',
    art: 'Fan of arrows arcing outward',
  },

  {
    id: 'bark_ward',
    name: 'Bark Ward',
    deck: 'green',
    count: 2,
    effects: [shld(2)],
    flavour: 'Older than the blade.',
    art: 'Overlapping bark plates forming a shield face',
  },

  {
    id: 'bramble_guard',
    name: 'Bramble Guard',
    deck: 'green',
    count: 2,
    effects: [dmg(1), shld(1)],
    flavour: 'Reach in and see.',
    art: 'Wall of thorns, one vine striking outward',
  },

  {
    id: 'track',
    name: 'Track',
    deck: 'green',
    count: 1,
    effects: [dmg(1), draw(1)],
    flavour: 'The trail is still warm.',
    art: 'Footprint filling with green light, path beyond',
  },

  {
    id: 'foragers_find',
    name: "Forager's Find",
    deck: 'green',
    count: 1,
    effects: [draw(2)],
    flavour: 'The grove provides.',
    art: 'Open palm holding berries, seeds and a folded leaf',
  },

  {
    id: 'regrowth',
    name: 'Regrowth',
    deck: 'green',
    count: 1,
    effects: [heal(2)],
    flavour: 'Slow, and certain.',
    art: 'Green shoot uncurling from a split seed',
  },
];

// ─────────────────────────────────────────────────────────────
// BLUE — Stormcaster. Heavy shields, chip damage, chains.
// Identity: lowest damage in the game, hardest to remove.
// ─────────────────────────────────────────────────────────────
export const BLUE_DECK: CardDef[] = [
  {
    id: 'arc_bolt',
    name: 'Arc Bolt',
    deck: 'blue',
    count: 3,
    effects: [dmg(2)],
    flavour: 'Shortest path to the ground.',
    art: 'Jagged blue bolt, forked once',
  },

  {
    id: 'tempest',
    name: 'Tempest',
    deck: 'blue',
    count: 2,
    effects: [dmg(3)],
    flavour: 'The sky picks a target.',
    art: 'Downward strike from a spiral of cloud',
  },

  {
    id: 'chain_lightning',
    name: 'Chain Lightning',
    deck: 'blue',
    count: 2,
    effects: [all(1)],
    flavour: 'It does not stop at one.',
    art: 'Branching bolt splitting to three points',
  },

  {
    id: 'mirror_ward',
    name: 'Mirror Ward',
    deck: 'blue',
    count: 3,
    effects: [shld(3)],
    flavour: 'Yours, returned.',
    art: 'Hexagonal pane of pale blue glass, faint reflection',
  },

  {
    id: 'static_field',
    name: 'Static Field',
    deck: 'blue',
    count: 2,
    effects: [dmg(1), shld(2)],
    flavour: 'Do not come closer.',
    art: 'Crackling sphere of blue arcs around a figure',
  },

  {
    id: 'conduit',
    name: 'Conduit',
    deck: 'blue',
    count: 2,
    effects: [dmg(1)],
    playAgain: true,
    flavour: 'Current wants a path.',
    art: 'Thin arc leaping between two raised rods',
  },

  {
    id: 'foresight',
    name: 'Foresight',
    deck: 'blue',
    count: 1,
    effects: [draw(2)],
    flavour: 'The storm announces itself.',
    art: 'Eye opening within a swirl of cloud, twin lights',
  },
];

// ─────────────────────────────────────────────────────────────
// YELLOW — Sunwarden. Sustain, cleansing, small steady damage.
// Identity: grinds. Wins by outlasting the aggressive decks.
// ─────────────────────────────────────────────────────────────
export const YELLOW_DECK: CardDef[] = [
  {
    id: 'radiant_strike',
    name: 'Radiant Strike',
    deck: 'yellow',
    count: 3,
    effects: [dmg(2)],
    flavour: 'Light, sharpened.',
    art: 'Sword of white-gold light, clean edge',
  },

  {
    id: 'judgement',
    name: 'Judgement',
    deck: 'yellow',
    count: 2,
    effects: [dmg(3)],
    flavour: 'Weighed and found wanting.',
    art: 'Descending beam striking a set of scales',
  },

  {
    id: 'dawnbreak',
    name: 'Dawnbreak',
    deck: 'yellow',
    count: 2,
    effects: [all(1)],
    flavour: 'Morning finds everyone.',
    art: 'Sunrise line spreading across a dark field',
  },

  {
    id: 'sun_ward',
    name: 'Sun Ward',
    deck: 'yellow',
    count: 2,
    effects: [shld(2)],
    flavour: 'Held aloft.',
    art: 'Radiant disc shield with rays as spokes',
  },

  {
    id: 'consecrate',
    name: 'Consecrate',
    deck: 'yellow',
    count: 2,
    effects: [dmg(1), heal(2)],
    flavour: 'The ground remembers.',
    art: 'Ring of golden light burning into stone',
  },

  {
    id: 'lay_on_hands',
    name: 'Lay on Hands',
    deck: 'yellow',
    count: 2,
    effects: [heal(3)],
    flavour: 'Be still.',
    art: 'Two hands over a chest, warm gold glow beneath',
  },

  {
    id: 'sunder',
    name: 'Sunder',
    deck: 'yellow',
    count: 1,
    effects: [strip(1), dmg(1)],
    flavour: 'Nothing stands between.',
    art: 'Beam of light splitting a dark barrier in two',
  },

  {
    id: 'revelation',
    name: 'Revelation',
    deck: 'yellow',
    count: 1,
    effects: [draw(1), heal(1)],
    flavour: 'See clearly.',
    art: 'Shaft of light through parting cloud onto an open book',
  },
];

export const DECKS: Record<DeckId, CardDef[]> = {
  red: RED_DECK,
  green: GREEN_DECK,
  blue: BLUE_DECK,
  yellow: YELLOW_DECK,
};

export function buildDeck(defs: CardDef[]): string[] {
  return defs.flatMap((c) => Array<string>(c.count).fill(c.id));
}
