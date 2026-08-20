// Test-only seams for driving a `Table` deterministically, shared by
// `gameState.test.ts` (the state machine) and `index.test.ts` (the wiring).
// Not a suite itself — vitest only collects `*.test.ts`.

import type { Card } from './gameState'

/** A constant RNG would mint every seat the same token, so tests need a real
 *  (if tiny) sequence — while staying reproducible run to run. */
export function seededRandom(seed = 1) {
  let value = seed
  return () => {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648
    return value / 2_147_483_648
  }
}

const cardKey = (card: Card) =>
  card.value === undefined ? card.type : `${card.type}:${card.value}`

/** Deck seam: front-loads the named cards so every seat's opening hand is known
 *  up front. The rest of the 15-card deck stays in template order behind them. */
export const deckOrderedBy = (keys: string[]) => (cards: Card[]) => {
  const rest = [...cards]
  const front: Card[] = []
  for (const key of keys) {
    const index = rest.findIndex((card) => cardKey(card) === key)
    if (index === -1) throw new Error(`no ${key} card left in deck`)
    front.push(...rest.splice(index, 1))
  }
  return [...front, ...rest]
}

/** One of each type, so a single turn can exercise every legality rule. */
export const MIXED_HAND = [
  'Defense',
  'Defense',
  'Heal:2',
  'Attack:1',
  'Attack:2',
]

/** 3+3+2+2 = 10 damage: enough to eliminate a full-HP seat in one turn. */
export const LETHAL_HAND = [
  'Attack:3',
  'Attack:3',
  'Attack:2',
  'Attack:2',
  'Attack:2',
]
