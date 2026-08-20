import { afterEach, describe, expect, it } from 'vitest'
import { clearSeatClaim, readSeatClaim, writeSeatClaim } from './reconnectToken'

afterEach(() => localStorage.clear())

describe('stored seat claim', () => {
  it('round-trips what a rejoin needs', () => {
    writeSeatClaim({ roomCode: 'FOXY', name: 'Dana', token: 'seat-1-abc' })

    expect(readSeatClaim()).toEqual({
      roomCode: 'FOXY',
      name: 'Dana',
      token: 'seat-1-abc',
    })
  })

  it('reads nothing when no claim was ever written', () => {
    expect(readSeatClaim()).toBeNull()
  })

  it('clears a claim so the next load starts at the join screen', () => {
    writeSeatClaim({ roomCode: 'FOXY', name: 'Dana', token: 'seat-1-abc' })
    clearSeatClaim()

    expect(readSeatClaim()).toBeNull()
  })

  it('ignores a stored value that is not a usable claim', () => {
    // Another tab, an older build, or a hand-edited value: anything that
    // wouldn't survive being handed to `join` is treated as no claim.
    localStorage.setItem('card-game:seat-claim', '{"roomCode":"FOXY"}')

    expect(readSeatClaim()).toBeNull()
  })

  it('ignores a stored value that is not JSON at all', () => {
    localStorage.setItem('card-game:seat-claim', 'not json')

    expect(readSeatClaim()).toBeNull()
  })
})
