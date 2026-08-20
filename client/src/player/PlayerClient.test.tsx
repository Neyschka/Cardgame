import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { HandCard, PublicSeat, PublicTableState } from '@card-game/shared'
import { createFakeSocket, type FakeSocket } from '../testSocket'
import { readSeatClaim, writeSeatClaim } from './reconnectToken'
import { PlayerClient } from './PlayerClient'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const seat = (over: Partial<PublicSeat> & { seatId: string }): PublicSeat => ({
  name: 'Ada',
  deckId: 'red',
  isHost: false,
  hp: 10,
  shields: 0,
  eliminated: false,
  handCount: 3,
  ...over,
})

const table = (over: Partial<PublicTableState> = {}): PublicTableState => ({
  roomCode: 'FOXY',
  lanAddress: '192.168.1.20:3001',
  phase: 'lobby',
  seats: [
    seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
    seat({ seatId: 'seat-2', name: 'Bo', deckId: 'green' }),
    seat({ seatId: 'seat-3', name: null, deckId: null }),
    seat({ seatId: 'seat-4', name: null, deckId: null }),
  ],
  turnSeatId: null,
  chainCount: 0,
  lastPlayed: null,
  eliminationOrder: [],
  matchResult: null,
  ...over,
})

// Generic test cards — real class-deck content is `cards.test.ts` and
// `resolve.test.ts`'s job; these just exercise the client's needsTarget-
// driven flow (single-target, self-only, and multi-effect).
const HAND: HandCard[] = [
  {
    id: 'c1',
    defId: 'strike',
    name: 'Strike',
    effects: [{ kind: 'attack', value: 3, target: 'single' }],
    playAgain: false,
    needsTarget: true,
  },
  {
    id: 'c2',
    defId: 'mend',
    name: 'Mend',
    effects: [{ kind: 'heal', value: 2, target: 'single' }],
    playAgain: false,
    needsTarget: false,
  },
  {
    id: 'c3',
    defId: 'ward',
    name: 'Ward',
    effects: [{ kind: 'shield', value: 1, target: 'single' }],
    playAgain: false,
    needsTarget: false,
  },
]

function renderPlayer() {
  const fake = createFakeSocket()
  render(<PlayerClient socket={fake.socket} />)
  return fake
}

/** Drives the join screen through to a seated client. */
function joinAs(fake: FakeSocket, seatId: string, state = table()) {
  fireEvent.change(screen.getByPlaceholderText('Your name'), {
    target: { value: 'Ada' },
  })
  fireEvent.change(screen.getByPlaceholderText('Room code'), {
    target: { value: 'foxy' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Enter the Fray' }))
  act(() =>
    fake.lastSent('join').ack({ ok: true, seatId, token: `${seatId}-tok` }),
  )
  act(() => fake.serverEmit('tableState', state))
}

describe('joining', () => {
  it('sends the typed name and room code, with no token on a fresh join', () => {
    const fake = renderPlayer()

    fireEvent.change(screen.getByPlaceholderText('Your name'), {
      target: { value: 'Ada' },
    })
    fireEvent.change(screen.getByPlaceholderText('Room code'), {
      target: { value: 'foxy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter the Fray' }))

    // Upper-cased to match how the code is shown on the display.
    expect(fake.lastSent('join').payload).toEqual({
      roomCode: 'FOXY',
      name: 'Ada',
    })
  })

  it('persists the minted token so a reload can reclaim the seat', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1')

    expect(readSeatClaim()).toEqual({
      roomCode: 'FOXY',
      name: 'Ada',
      token: 'seat-1-tok',
    })
  })

  it('shows the rejection reason and stays on the join screen', () => {
    const fake = renderPlayer()

    fireEvent.change(screen.getByPlaceholderText('Your name'), {
      target: { value: 'Ada' },
    })
    fireEvent.change(screen.getByPlaceholderText('Room code'), {
      target: { value: 'FOXY' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter the Fray' }))
    act(() => fake.lastSent('join').ack({ ok: false, reason: 'table full' }))

    expect(screen.getByText('table full')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enter the Fray' })).toBeTruthy()
  })

  it('reclaims the stored seat on load without showing the join screen', () => {
    writeSeatClaim({ roomCode: 'FOXY', name: 'Ada', token: 'seat-1-tok' })
    const fake = renderPlayer()

    expect(fake.lastSent('join').payload).toEqual({
      roomCode: 'FOXY',
      name: 'Ada',
      token: 'seat-1-tok',
    })
    expect(screen.queryByPlaceholderText('Your name')).toBeNull()
  })

  it('rejoins with the token when the socket reconnects mid-match', () => {
    // socket.io reconnects as a new socket id, so the seat is only held by
    // handing the token back — this is what makes a 60s dropout survivable.
    const fake = renderPlayer()
    joinAs(fake, 'seat-1')
    const beforeReconnect = fake.sent.filter((a) => a.event === 'join').length

    act(() => fake.connect())

    expect(fake.sent.filter((a) => a.event === 'join')).toHaveLength(
      beforeReconnect + 1,
    )
    expect(fake.lastSent('join').payload).toEqual({
      roomCode: 'FOXY',
      name: 'Ada',
      token: 'seat-1-tok',
    })
  })

  it('falls back to the join screen when a stored token is no longer valid', () => {
    writeSeatClaim({ roomCode: 'FOXY', name: 'Ada', token: 'stale' })
    const fake = renderPlayer()
    act(() => fake.lastSent('join').ack({ ok: false, reason: 'table full' }))

    expect(screen.getByPlaceholderText('Your name')).toBeTruthy()
    expect(readSeatClaim()).toBeNull()
  })
})

describe('lobby', () => {
  it('lists the claimed seats with their class, and tells a guest to wait', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-2')

    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Bo')).toBeTruthy()
    // Announced, not chosen — no selection control exists.
    expect(screen.getByText('Pyromancer')).toBeTruthy()
    expect(screen.getByText('Sylvan Ranger')).toBeTruthy()
    expect(screen.getByText('Waiting for the host to start…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Begin Battle/ })).toBeNull()
  })

  it('gives the host a Start button, blocked below two players', () => {
    const fake = renderPlayer()
    joinAs(
      fake,
      'seat-1',
      table({
        seats: [
          seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
          seat({ seatId: 'seat-2', name: null, deckId: null }),
        ],
      }),
    )

    const start = screen.getByRole('button', {
      name: 'Need at least 2 players',
    })
    expect((start as HTMLButtonElement).disabled).toBe(true)
  })

  it('starts the match once two seats are filled', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1')

    fireEvent.click(screen.getByRole('button', { name: 'Begin Battle' }))

    expect(fake.lastSent('start').event).toBe('start')
  })

  it('surfaces a rejected start', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1')
    fireEvent.click(screen.getByRole('button', { name: 'Begin Battle' }))
    act(() =>
      fake
        .lastSent('start')
        .ack({ ok: false, reason: 'need at least 2 players' }),
    )

    expect(screen.getByText('need at least 2 players')).toBeTruthy()
  })
})

describe('in match', () => {
  const inMatch = (over: Partial<PublicTableState> = {}) =>
    table({ phase: 'inMatch', turnSeatId: 'seat-1', ...over })

  function seatedInMatch(over: Partial<PublicTableState> = {}) {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1', inMatch(over))
    act(() => fake.serverEmit('yourHand', HAND))
    return fake
  }

  it('renders the hand only from yourHand, never from tableState', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1', inMatch())

    // `tableState` carries a handCount of 3 and no contents — nothing to render.
    expect(screen.queryByText('Strike')).toBeNull()

    act(() => fake.serverEmit('yourHand', HAND))

    expect(screen.getByText('Strike')).toBeTruthy()
  })

  it('plays a card with no single-target effect straight away, on one tap', () => {
    const fake = seatedInMatch()

    fireEvent.click(screen.getByRole('button', { name: /Mend/ }))

    expect(fake.lastSent('playCard').payload).toEqual({ cardId: 'c2' })
  })

  it('goes straight to the targeting screen for a single-target card, offering only living opponents', () => {
    // Two living opponents, so this isn't the auto-target case — the picker
    // has a real choice to offer, and Di (eliminated) has to be filtered out.
    const fake = seatedInMatch({
      seats: [
        seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
        seat({ seatId: 'seat-2', name: 'Bo', deckId: 'green' }),
        seat({ seatId: 'seat-3', name: 'Cy', deckId: 'blue' }),
        seat({
          seatId: 'seat-4',
          name: 'Di',
          deckId: 'yellow',
          eliminated: true,
        }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /Strike/ }))

    expect(screen.getByText('CHOOSE A TARGET')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Bo/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Cy/ })).toBeTruthy()
    // Not itself, not an eliminated seat.
    expect(screen.queryByRole('button', { name: /^Ada/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Di/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Bo/ }))

    expect(fake.lastSent('playCard').payload).toEqual({
      cardId: 'c1',
      targetSeatId: 'seat-2',
    })
  })

  it('skips the target picker and plays immediately with a single living opponent', () => {
    const fake = seatedInMatch({
      seats: [
        seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
        seat({ seatId: 'seat-2', name: 'Bo', deckId: 'green' }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /Strike/ }))

    // No picker screen — the server auto-targets the sole opponent.
    expect(screen.queryByText('CHOOSE A TARGET')).toBeNull()
    expect(fake.lastSent('playCard').payload).toEqual({ cardId: 'c1' })
  })

  it('backs out of targeting without playing', () => {
    // Two living opponents, so there's a picker to back out of.
    const fake = seatedInMatch({
      seats: [
        seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
        seat({ seatId: 'seat-2', name: 'Bo', deckId: 'green' }),
        seat({ seatId: 'seat-3', name: 'Cy', deckId: 'blue' }),
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /Strike/ }))

    fireEvent.click(
      screen.getByRole('button', { name: /Choose a different card/i }),
    )

    expect(fake.sent.some((a) => a.event === 'playCard')).toBe(false)
    // Back on the hand screen.
    expect(screen.getByRole('button', { name: /Strike/ })).toBeTruthy()
  })

  it('returns to the hand screen once a targeted play is accepted', async () => {
    const fake = seatedInMatch({
      seats: [
        seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
        seat({ seatId: 'seat-2', name: 'Bo', deckId: 'green' }),
        seat({ seatId: 'seat-3', name: 'Cy', deckId: 'blue' }),
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /Strike/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Bo/ }))

    await act(async () => fake.lastSent('playCard').ack({ ok: true }))

    expect(screen.queryByText('CHOOSE A TARGET')).toBeNull()
  })

  it('shows whose turn it is and blocks play when it is not yours', () => {
    const fake = seatedInMatch({ turnSeatId: 'seat-2' })

    expect(screen.getByText("BO'S TURN")).toBeTruthy()
    // The grid never disappears — it stops accepting taps.
    const strike = screen.getByRole('button', {
      name: /Strike/,
    }) as HTMLButtonElement
    expect(strike.disabled).toBe(true)
    fireEvent.click(strike)
    expect(fake.sent.some((a) => a.event === 'playCard')).toBe(false)
  })

  it('shows own HP and shield pips', () => {
    seatedInMatch({
      seats: [
        seat({
          seatId: 'seat-1',
          name: 'Ada',
          isHost: true,
          hp: 7,
          shields: 2,
        }),
      ],
    })

    expect(screen.getByText('7 / 10')).toBeTruthy()
    expect(screen.getAllByTestId('shield-pip-on')).toHaveLength(2)
    expect(screen.getAllByTestId('shield-pip-off')).toHaveLength(2)
  })

  it('reports a rejected play', () => {
    const fake = seatedInMatch()
    fireEvent.click(screen.getByRole('button', { name: /Mend/ }))
    act(() =>
      fake.lastSent('playCard').ack({ ok: false, reason: 'not your turn' }),
    )

    expect(screen.getByText('not your turn')).toBeTruthy()
  })

  it('replaces everything with the eliminated screen for a knocked-out seat', () => {
    const fake = renderPlayer()
    joinAs(
      fake,
      'seat-1',
      inMatch({
        turnSeatId: 'seat-2',
        seats: [
          seat({
            seatId: 'seat-1',
            name: 'Ada',
            isHost: true,
            hp: 0,
            eliminated: true,
          }),
          seat({ seatId: 'seat-2', name: 'Bo', deckId: 'green' }),
        ],
        eliminationOrder: ['seat-1'],
      }),
    )
    act(() => fake.serverEmit('yourHand', []))

    expect(screen.getByText(/eliminated/i)).toBeTruthy()
    expect(screen.queryByText("BO'S TURN")).toBeNull()
  })
})

describe('match over', () => {
  const over = (seats?: PublicSeat[]) =>
    table({
      phase: 'matchOver',
      seats: seats ?? table().seats,
      matchResult: { winnerSeatId: 'seat-1' },
      eliminationOrder: ['seat-2'],
    })

  it('points everyone at the shared screen', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-2', over())

    expect(screen.getByText(/Match over/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /New match/ })).toBeNull()
  })

  it('gives the host a New match button', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1', over())

    fireEvent.click(screen.getByRole('button', { name: 'New match' }))

    expect(fake.lastSent('newMatch').event).toBe('newMatch')
  })

  it('blocks New match below two players', () => {
    const fake = renderPlayer()
    joinAs(
      fake,
      'seat-1',
      over([
        seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
        seat({ seatId: 'seat-2', name: null, deckId: null }),
      ]),
    )

    expect(
      (
        screen.getByRole('button', {
          name: 'Need at least 2 players',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('shows the eliminated player the match-over screen too', () => {
    const fake = renderPlayer()
    joinAs(
      fake,
      'seat-2',
      over([
        seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
        seat({
          seatId: 'seat-2',
          name: 'Bo',
          deckId: 'green',
          hp: 0,
          eliminated: true,
        }),
      ]),
    )

    expect(screen.getByText(/Match over/)).toBeTruthy()
  })
})

describe('reconnect veil', () => {
  it('shows a countdown when a held seat drops, clearing once the socket reconnects', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1')

    act(() => fake.disconnect())

    expect(screen.getByText('Reconnecting…')).toBeTruthy()

    act(() => fake.connect())

    expect(screen.queryByText('Reconnecting…')).toBeNull()
  })

  it('does not veil a drop before any seat is held', () => {
    const fake = renderPlayer()

    act(() => fake.disconnect())

    expect(screen.queryByText('Reconnecting…')).toBeNull()
  })
})
