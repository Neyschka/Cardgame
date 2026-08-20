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
  isHost: false,
  hp: 10,
  shielded: false,
  eliminated: false,
  handCount: 5,
  ...over,
})

const table = (over: Partial<PublicTableState> = {}): PublicTableState => ({
  roomCode: 'FOXY',
  lanAddress: '192.168.1.20:3001',
  phase: 'lobby',
  seats: [
    seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
    seat({ seatId: 'seat-2', name: 'Bo' }),
    seat({ seatId: 'seat-3', name: null }),
    seat({ seatId: 'seat-4', name: null }),
  ],
  turnSeatId: null,
  lastPlayed: null,
  eliminationOrder: [],
  matchResult: null,
  ...over,
})

const HAND: HandCard[] = [
  { id: 'c1', type: 'Attack', value: 3, legal: true },
  { id: 'c2', type: 'Heal', value: 2, legal: true },
  { id: 'c3', type: 'Defense', legal: false },
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
  fireEvent.click(screen.getByRole('button', { name: 'Join' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    act(() => fake.lastSent('join').ack({ ok: false, reason: 'table full' }))

    expect(screen.getByText('table full')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Join' })).toBeTruthy()
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
  it('lists the claimed seats and tells a guest to wait', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-2')

    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Bo')).toBeTruthy()
    expect(screen.getByText('Waiting for the host to start…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Start match/ })).toBeNull()
  })

  it('gives the host a Start button, blocked below two players', () => {
    const fake = renderPlayer()
    joinAs(
      fake,
      'seat-1',
      table({
        seats: [
          seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
          seat({ seatId: 'seat-2', name: null }),
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

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }))

    expect(fake.lastSent('start').event).toBe('start')
  })

  it('surfaces a rejected start', () => {
    const fake = renderPlayer()
    joinAs(fake, 'seat-1')
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }))
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

    // `tableState` carries a handCount of 5 and no contents — nothing to render.
    expect(screen.queryByText('Attack 3')).toBeNull()

    act(() => fake.serverEmit('yourHand', HAND))

    expect(screen.getByText('Attack 3')).toBeTruthy()
  })

  it('greys a dead card and says why, instead of hiding it', () => {
    seatedInMatch()

    const defense = screen.getByRole('button', { name: /Defense/ })
    expect((defense as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('already shielded')).toBeTruthy()
  })

  it('plays a Heal straight away, with no target step', () => {
    const fake = seatedInMatch()

    fireEvent.click(screen.getByRole('button', { name: /Heal 2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Heal 2' }))

    expect(fake.lastSent('playCard').payload).toEqual({ cardId: 'c2' })
  })

  it('asks an Attack for a target, offering only living opponents', () => {
    const fake = seatedInMatch({
      seats: [
        seat({ seatId: 'seat-1', name: 'Ada', isHost: true }),
        seat({ seatId: 'seat-2', name: 'Bo' }),
        seat({ seatId: 'seat-3', name: 'Cy', eliminated: true }),
        seat({ seatId: 'seat-4', name: null }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /Attack 3/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Attack 3' }))

    expect(screen.getByRole('button', { name: /^Bo/ })).toBeTruthy()
    // Not itself, not an eliminated seat, not an unclaimed one.
    expect(screen.queryByRole('button', { name: /^Ada/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Cy/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Bo/ }))

    expect(fake.lastSent('playCard').payload).toEqual({
      cardId: 'c1',
      targetSeatId: 'seat-2',
    })
  })

  it('backs out of targeting without playing', () => {
    const fake = seatedInMatch()
    fireEvent.click(screen.getByRole('button', { name: /Attack 3/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Attack 3' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(fake.sent.some((a) => a.event === 'playCard')).toBe(false)
    expect(screen.getByRole('button', { name: 'Play Attack 3' })).toBeTruthy()
  })

  it('shows whose turn it is and blocks play when it is not yours', () => {
    seatedInMatch({ turnSeatId: 'seat-2' })

    expect(screen.getByText("Bo's turn")).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'Select a card',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    // The grid never disappears — it stops accepting taps.
    expect(screen.getByText('Attack 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Attack 3/ }))
    expect(screen.queryByRole('button', { name: 'Play Attack 3' })).toBeNull()
  })

  it('shows own HP and shield', () => {
    seatedInMatch({
      seats: [
        seat({
          seatId: 'seat-1',
          name: 'Ada',
          isHost: true,
          hp: 7,
          shielded: true,
        }),
      ],
    })

    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('HP · 🛡️ shielded')).toBeTruthy()
  })

  it('reports a rejected play', () => {
    const fake = seatedInMatch()
    fireEvent.click(screen.getByRole('button', { name: /Heal 2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Heal 2' }))
    act(() =>
      fake.lastSent('playCard').ack({ ok: false, reason: 'not your turn' }),
    )

    expect(screen.getByText('not your turn')).toBeTruthy()
  })

  it('clears the selection once a play is accepted', async () => {
    const fake = seatedInMatch()
    fireEvent.click(screen.getByRole('button', { name: /Heal 2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Heal 2' }))
    await act(async () => fake.lastSent('playCard').ack({ ok: true }))

    expect(screen.getByRole('button', { name: 'Select a card' })).toBeTruthy()
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
          seat({ seatId: 'seat-2', name: 'Bo' }),
        ],
        eliminationOrder: ['seat-1'],
      }),
    )
    act(() => fake.serverEmit('yourHand', []))

    expect(screen.getByText(/eliminated/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Play/ })).toBeNull()
    expect(screen.queryByText("Bo's turn")).toBeNull()
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
        seat({ seatId: 'seat-2', name: null }),
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
        seat({ seatId: 'seat-2', name: 'Bo', hp: 0, eliminated: true }),
      ]),
    )

    expect(screen.getByText(/Match over/)).toBeTruthy()
  })
})
