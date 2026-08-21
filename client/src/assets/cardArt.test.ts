import { describe, expect, it } from 'vitest'
import { cardArtUrl } from './cardArt'

describe('cardArtUrl', () => {
  it('resolves a defId to its jpg', () => {
    expect(cardArtUrl('ember_bolt')).toMatch(/\/cards\/ember_bolt\.jpg$/)
  })

  it('resolves every card def id to a distinct url', () => {
    const urls = new Set(
      ['ember_bolt', 'kindle', 'lay_on_hands'].map(cardArtUrl),
    )
    expect(urls.size).toBe(3)
  })
})
