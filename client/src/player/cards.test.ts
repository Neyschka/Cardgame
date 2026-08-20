import { describe, expect, it } from 'vitest'
import { cardLabel, illegalReason, typeIcon } from './cards'

describe('cardLabel', () => {
  it('includes the value when a card has one', () => {
    expect(cardLabel({ id: 'c1', type: 'Attack', value: 3, legal: true })).toBe(
      'Attack 3',
    )
  })

  it('omits the value for a Defense card, which has none', () => {
    expect(cardLabel({ id: 'c2', type: 'Defense', legal: true })).toBe(
      'Defense',
    )
  })
})

describe('illegalReason', () => {
  // The server decides legality and sends only the boolean, so the one-line
  // reason the grid shows is re-derived here from the card's type. These
  // strings match `server/src/gameState.ts`'s `illegalReason`.
  it('explains a dead Defense card', () => {
    expect(illegalReason({ id: 'c1', type: 'Defense', legal: false })).toBe(
      'already shielded',
    )
  })

  it('explains a dead Heal card', () => {
    expect(
      illegalReason({ id: 'c2', type: 'Heal', value: 2, legal: false }),
    ).toBe('already at full HP')
  })

  it('explains a dead Attack', () => {
    expect(
      illegalReason({ id: 'c3', type: 'Attack', value: 1, legal: false }),
    ).toBe('no living opponents')
  })

  it('gives no reason for a legal card', () => {
    expect(
      illegalReason({ id: 'c4', type: 'Heal', value: 2, legal: true }),
    ).toBeNull()
  })
})

describe('typeIcon', () => {
  it('has an icon for every card type', () => {
    expect([typeIcon('Attack'), typeIcon('Defense'), typeIcon('Heal')]).toEqual(
      ['⚔️', '🛡️', '➕'],
    )
  })
})
