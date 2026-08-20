import { describe, expect, it } from 'vitest'
import type { DeckId } from '@card-game/shared'
import { buildDeck, DECKS, DECK_SIZE } from './cards'

const DECK_IDS: DeckId[] = ['red', 'green', 'blue', 'yellow']

describe('class decks', () => {
  it('every class deck builds to exactly 15 cards', () => {
    for (const id of DECK_IDS) {
      expect(buildDeck(DECKS[id])).toHaveLength(DECK_SIZE)
    }
  })

  it('every card definition id is unique within its own deck', () => {
    for (const id of DECK_IDS) {
      const ids = DECKS[id].map((def) => def.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})
