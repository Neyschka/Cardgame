import { describe, expect, it } from 'vitest'
import type { CardType, PublicSeat } from '@card-game/shared'
import {
  createTable,
  DISCONNECT_TIMEOUT_MS,
  type Table,
  type TableOptions,
} from './gameState'
import {
  deckOrderedBy,
  LETHAL_HAND,
  MIXED_HAND,
  seededRandom,
} from './testFixtures'

const ROOM_CODE = 'ABCD'
const LAN_ADDRESS = '192.168.1.20:3001'
const FULL_DECK = 15

function setup(
  opening: string[] = MIXED_HAND,
  overrides: Partial<TableOptions> = {},
) {
  let clock = 10_000
  const table = createTable({
    roomCode: ROOM_CODE,
    lanAddress: LAN_ADDRESS,
    now: () => clock,
    random: seededRandom(),
    shuffleDeck: deckOrderedBy(opening),
    shuffleTurnOrder: (seatIds) => [...seatIds],
    ...overrides,
  })
  return {
    table,
    tick: (ms: number) => {
      clock += ms
    },
  }
}

function join(table: Table, index: number, name: string) {
  const result = table.join({
    socketId: `sock-${index}`,
    roomCode: ROOM_CODE,
    name,
  })
  if (!result.ok) throw new Error(result.reason)
  return result
}

/** Seats `names` and starts the match with the first seat as host. */
function startedMatch(table: Table, names: string[]) {
  const joins = names.map((name, index) => join(table, index + 1, name))
  const started = table.start({ socketId: 'sock-1' })
  if (!started.ok) throw new Error(started.reason)
  return joins
}

function seatOf(table: Table, seatId: string) {
  const found = table.publicState().seats.find((s) => s.seatId === seatId)
  if (!found) throw new Error(`no ${seatId}`)
  return found
}

const socketFor = (seatId: string) => `sock-${seatId.replace('seat-', '')}`

function cardOfType(
  table: Table,
  seatId: string,
  type: CardType,
  value?: number,
) {
  const card = table
    .handFor(seatId)
    .find((c) => c.type === type && (value === undefined || c.value === value))
  if (!card) throw new Error(`no ${type} in ${seatId}'s hand`)
  return card
}

function play(
  table: Table,
  socketId: string,
  card: { id: string },
  targetSeatId?: string,
) {
  const result = table.playCard({ socketId, cardId: card.id, targetSeatId })
  if (!result.ok) throw new Error(result.reason)
}

type PickTarget = (opponents: PublicSeat[]) => PublicSeat | undefined

/** Always attacks the named seat — keeps damage off the seat under test. */
const alwaysTarget =
  (seatId: string): PickTarget =>
  (opponents) =>
    opponents.find((seat) => seat.seatId === seatId)

/** Spreads damage around, so a four-player match outlives a deck cycle. */
const healthiestOpponent: PickTarget = (opponents) =>
  [...opponents].sort((a, b) => b.hp - a.hp)[0]

/** Plays out a whole turn the way a client would — first legal card each time —
 *  until the turn passes on. */
function playOutTurn(
  table: Table,
  socketId: string,
  pickTarget: PickTarget = (opponents) => opponents[0],
) {
  const seatId = table.seatIdForSocket(socketId)
  if (!seatId) throw new Error(`${socketId} is not seated`)
  for (let guard = 0; guard < 20; guard++) {
    if (table.publicState().turnSeatId !== seatId) return
    const card = table.handFor(seatId).find((c) => c.legal)
    if (!card) return
    const opponents = table
      .publicState()
      .seats.filter((s) => s.name !== null && !s.eliminated && s.seatId !== seatId)
    play(table, socketId, card, pickTarget(opponents)?.seatId)
  }
  throw new Error('turn never ended')
}

describe('seat claiming', () => {
  it('seats the first joiner as host and the next in the following slot', () => {
    const { table } = setup()

    const first = join(table, 1, 'Ada')
    const second = join(table, 2, 'Bo')

    expect(first.seatId).toBe('seat-1')
    expect(second.seatId).toBe('seat-2')
    expect(seatOf(table, 'seat-1')).toMatchObject({ name: 'Ada', isHost: true })
    expect(seatOf(table, 'seat-2')).toMatchObject({ name: 'Bo', isHost: false })
  })

  it('mints a distinct token per seat', () => {
    const { table } = setup()

    const tokens = ['Ada', 'Bo', 'Cy', 'Di'].map(
      (name, index) => join(table, index + 1, name).token,
    )

    expect(new Set(tokens).size).toBe(4)
  })

  it('rejects a wrong room code and a table with no open slot', () => {
    const { table } = setup()

    expect(
      table.join({ socketId: 'sock-x', roomCode: 'ZZZZ', name: 'Ada' }),
    ).toEqual({ ok: false, reason: 'wrong room code' })

    for (const [index, name] of ['Ada', 'Bo', 'Cy', 'Di'].entries()) {
      join(table, index + 1, name)
    }

    expect(
      table.join({ socketId: 'sock-5', roomCode: ROOM_CODE, name: 'Eve' }),
    ).toEqual({ ok: false, reason: 'table full' })
  })

  it('reclaims the same seat by token, ignoring the supplied name', () => {
    const { table } = setup()
    const first = join(table, 1, 'Ada')
    join(table, 2, 'Bo')

    table.disconnect('sock-1')
    const reclaimed = table.join({
      socketId: 'sock-1-again',
      roomCode: ROOM_CODE,
      name: 'Somebody Else',
      token: first.token,
    })

    expect(reclaimed).toEqual({ ok: true, seatId: 'seat-1', token: first.token })
    expect(seatOf(table, 'seat-1').name).toBe('Ada')
    expect(table.seatIdForSocket('sock-1-again')).toBe('seat-1')
  })

  it('refuses a fresh join once the match is under way', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])

    expect(
      table.join({ socketId: 'sock-9', roomCode: ROOM_CODE, name: 'Late' }),
    ).toEqual({ ok: false, reason: 'match already in progress' })
  })

  it('still reclaims a seat by token mid-match', () => {
    const { table } = setup()
    const [, bo] = startedMatch(table, ['Ada', 'Bo'])
    if (!bo) throw new Error('Bo never got a seat')

    table.disconnect('sock-2')

    expect(
      table.join({
        socketId: 'sock-2-again',
        roomCode: ROOM_CODE,
        name: 'Bo',
        token: bo.token,
      }),
    ).toEqual({ ok: true, seatId: 'seat-2', token: bo.token })
  })
})

describe('start', () => {
  it('is host-only and gated at two players', () => {
    const { table } = setup()
    join(table, 1, 'Ada')

    expect(table.start({ socketId: 'sock-1' })).toEqual({
      ok: false,
      reason: 'need at least 2 players',
    })

    join(table, 2, 'Bo')

    expect(table.start({ socketId: 'sock-2' })).toEqual({
      ok: false,
      reason: 'only the host can start the match',
    })
    expect(table.start({ socketId: 'sock-1' })).toEqual({ ok: true })
    expect(table.start({ socketId: 'sock-1' })).toEqual({
      ok: false,
      reason: 'match already in progress',
    })
  })

  it('deals five cards to each seat and hands the first seat the turn', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo', 'Cy'])
    const state = table.publicState()

    expect(state.phase).toBe('inMatch')
    expect(state.turnSeatId).toBe('seat-1')
    expect(
      state.seats.filter((s) => s.name !== null).map((s) => s.handCount),
    ).toEqual([5, 5, 5])
    expect(
      state.seats.filter((s) => s.name !== null).map((s) => s.hp),
    ).toEqual([10, 10, 10])
    expect(table.handFor('seat-1')).toHaveLength(5)
    expect(table.handFor('seat-4')).toEqual([])
  })

  it('keeps a seat that dropped inside its 60s window', () => {
    const { table, tick } = setup()
    join(table, 1, 'Ada')
    join(table, 2, 'Bo')

    table.disconnect('sock-2')
    tick(5_000)

    expect(table.start({ socketId: 'sock-1' })).toEqual({ ok: true })
    expect(seatOf(table, 'seat-2')).toMatchObject({ name: 'Bo', handCount: 5 })
  })
})

describe('legal plays', () => {
  it('marks a Heal dead at full HP and rejects playing it', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    const heal = cardOfType(table, 'seat-1', 'Heal')
    const before = table.publicState()

    expect(heal.legal).toBe(false)
    expect(table.playCard({ socketId: 'sock-1', cardId: heal.id })).toEqual({
      ok: false,
      reason: 'already at full HP',
    })
    expect(table.publicState()).toEqual(before)
    expect(table.handFor('seat-1')).toHaveLength(5)
  })

  it('marks a second Defense dead while shielded', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    play(table, 'sock-1', cardOfType(table, 'seat-1', 'Defense'))

    expect(seatOf(table, 'seat-1').shielded).toBe(true)
    const second = cardOfType(table, 'seat-1', 'Defense')
    expect(second.legal).toBe(false)
    expect(table.playCard({ socketId: 'sock-1', cardId: second.id })).toEqual({
      ok: false,
      reason: 'already shielded',
    })
  })

  it('requires a living opponent as an Attack target', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    const attack = cardOfType(table, 'seat-1', 'Attack', 1)

    expect(attack.legal).toBe(true)
    expect(table.playCard({ socketId: 'sock-1', cardId: attack.id })).toEqual({
      ok: false,
      reason: 'attack needs a target',
    })
    expect(
      table.playCard({
        socketId: 'sock-1',
        cardId: attack.id,
        targetSeatId: 'seat-1',
      }),
    ).toEqual({ ok: false, reason: 'you cannot target yourself' })
    expect(
      table.playCard({
        socketId: 'sock-1',
        cardId: attack.id,
        targetSeatId: 'seat-3',
      }),
    ).toEqual({ ok: false, reason: 'invalid target' })
  })

  it('rejects a play from a seat that is not on turn', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    const card = cardOfType(table, 'seat-2', 'Defense')

    expect(table.playCard({ socketId: 'sock-2', cardId: card.id })).toEqual({
      ok: false,
      reason: 'not your turn',
    })
    expect(table.playCard({ socketId: 'sock-1', cardId: card.id })).toEqual({
      ok: false,
      reason: 'card not in hand',
    })
  })
})

describe('turn resolution', () => {
  it('resolves damage, shields, heals and play-until-cant across two turns', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])

    // Ada shields, then spends both attacks. Her dead cards (a second Defense,
    // a Heal at full HP) end the turn, and she refills back to five.
    play(table, 'sock-1', cardOfType(table, 'seat-1', 'Defense'))
    play(table, 'sock-1', cardOfType(table, 'seat-1', 'Attack', 1), 'seat-2')
    expect(seatOf(table, 'seat-2').hp).toBe(9)
    expect(table.publicState().turnSeatId).toBe('seat-1')
    expect(table.publicState().lastPlayed).toEqual({
      type: 'Attack',
      value: 1,
      bySeatId: 'seat-1',
    })

    play(table, 'sock-1', cardOfType(table, 'seat-1', 'Attack', 2), 'seat-2')
    expect(seatOf(table, 'seat-2').hp).toBe(7)
    expect(table.publicState().turnSeatId).toBe('seat-2')
    expect(seatOf(table, 'seat-1').handCount).toBe(5)

    // Bo's first attack is eaten by Ada's shield; the shield is then spent, so
    // the second one lands in full.
    play(table, 'sock-2', cardOfType(table, 'seat-2', 'Attack', 1), 'seat-1')
    expect(seatOf(table, 'seat-1')).toMatchObject({ hp: 10, shielded: false })
    play(table, 'sock-2', cardOfType(table, 'seat-2', 'Attack', 2), 'seat-1')
    expect(seatOf(table, 'seat-1').hp).toBe(8)

    playOutTurn(table, 'sock-2')
    expect(table.publicState().turnSeatId).toBe('seat-1')

    // Below max HP, the Heal Ada has been sitting on is finally legal.
    play(table, 'sock-1', cardOfType(table, 'seat-1', 'Heal'))
    expect(seatOf(table, 'seat-1').hp).toBe(10)
  })

  it("expires an unused shield at the start of that seat's next turn", () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo', 'Cy'])

    // Nobody attacks Ada, so her shield is still up when her turn comes round.
    playOutTurn(table, 'sock-1', alwaysTarget('seat-3'))
    expect(seatOf(table, 'seat-1').shielded).toBe(true)
    playOutTurn(table, 'sock-2', alwaysTarget('seat-3'))
    playOutTurn(table, 'sock-3', alwaysTarget('seat-2'))

    expect(table.publicState().turnSeatId).toBe('seat-1')
    expect(seatOf(table, 'seat-1').shielded).toBe(false)
  })

  it("reshuffles a seat's discard pile once its draw pile runs dry", () => {
    const shuffledPiles: number[] = []
    const order = deckOrderedBy(MIXED_HAND)
    const { table } = setup(MIXED_HAND, {
      // Only a freshly built deck can be put in a fixed order; a reshuffle is
      // handed the discard pile, which holds whatever happened to be played.
      shuffleDeck: (cards) => {
        shuffledPiles.push(cards.length)
        return cards.length === FULL_DECK ? order(cards) : [...cards]
      },
    })
    startedMatch(table, ['Ada', 'Bo', 'Cy', 'Di'])

    for (let turn = 0; turn < 12; turn++) {
      const seatId = table.publicState().turnSeatId
      if (!seatId) break
      playOutTurn(table, socketFor(seatId), healthiestOpponent)
    }

    const reshuffles = shuffledPiles.filter((size) => size < FULL_DECK)
    expect(reshuffles.length).toBeGreaterThan(0)
  })

  it('never puts card contents in the public state', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    const [card] = table.handFor('seat-1')
    if (!card) throw new Error('no cards were dealt')

    expect(JSON.stringify(table.publicState())).not.toContain(card.id)
    expect(JSON.stringify(table.publicState())).not.toContain('Defense')
  })
})

describe('elimination', () => {
  it('eliminates a seat at 0 HP, clearing its cards and skipping its turn', () => {
    const { table } = setup(LETHAL_HAND)
    startedMatch(table, ['Ada', 'Bo', 'Cy'])

    playOutTurn(table, 'sock-1')

    expect(seatOf(table, 'seat-2')).toMatchObject({
      hp: 0,
      eliminated: true,
      handCount: 0,
    })
    expect(table.publicState().eliminationOrder).toEqual(['seat-2'])
    expect(table.publicState().turnSeatId).toBe('seat-3')
    expect(table.handFor('seat-2')).toEqual([])
    expect(table.publicState().phase).toBe('inMatch')
  })

  it('ends the match once one seat is left standing', () => {
    const { table } = setup(LETHAL_HAND)
    startedMatch(table, ['Ada', 'Bo'])

    playOutTurn(table, 'sock-1')

    expect(table.publicState()).toMatchObject({
      phase: 'matchOver',
      turnSeatId: null,
      matchResult: { winnerSeatId: 'seat-1' },
      eliminationOrder: ['seat-2'],
    })
  })

  it('rejects a play from an eliminated seat', () => {
    const { table } = setup(LETHAL_HAND)
    startedMatch(table, ['Ada', 'Bo', 'Cy'])
    const doomed = cardOfType(table, 'seat-2', 'Attack', 3)
    playOutTurn(table, 'sock-1')

    expect(
      table.playCard({
        socketId: 'sock-2',
        cardId: doomed.id,
        targetSeatId: 'seat-1',
      }),
    ).toEqual({ ok: false, reason: 'you are eliminated' })
  })
})

describe('disconnect handling', () => {
  it('ends the turn of a seat that drops on its own turn, draw step included', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo', 'Cy'])
    play(table, 'sock-1', cardOfType(table, 'seat-1', 'Defense'))
    play(table, 'sock-1', cardOfType(table, 'seat-1', 'Attack', 1), 'seat-2')
    expect(seatOf(table, 'seat-1').handCount).toBe(3)

    table.disconnect('sock-1')

    expect(table.publicState().turnSeatId).toBe('seat-2')
    expect(seatOf(table, 'seat-1').handCount).toBe(5)
    // Nothing about the drop is visible on the wire until it eliminates.
    expect(seatOf(table, 'seat-1')).toMatchObject({
      name: 'Ada',
      eliminated: false,
    })
  })

  it('skips a disconnected seat when rotation reaches it', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo', 'Cy'])

    table.disconnect('sock-2')
    playOutTurn(table, 'sock-1')

    expect(table.publicState().turnSeatId).toBe('seat-3')
  })

  it('eliminates a seat once it has been gone 60s, ending the match', () => {
    const { table, tick } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    table.disconnect('sock-2')

    tick(DISCONNECT_TIMEOUT_MS - 1_000)
    expect(table.expireDisconnected()).toEqual([])
    expect(seatOf(table, 'seat-2').eliminated).toBe(false)

    tick(2_000)
    expect(table.expireDisconnected()).toEqual(['seat-2'])
    expect(seatOf(table, 'seat-2')).toMatchObject({
      eliminated: true,
      handCount: 0,
    })
    expect(table.publicState()).toMatchObject({
      phase: 'matchOver',
      matchResult: { winnerSeatId: 'seat-1' },
      eliminationOrder: ['seat-2'],
    })
  })

  it('keeps the seat when it reconnects inside the 60s window', () => {
    const { table, tick } = setup()
    const [, bo] = startedMatch(table, ['Ada', 'Bo'])
    if (!bo) throw new Error('Bo never got a seat')

    table.disconnect('sock-2')
    tick(DISCONNECT_TIMEOUT_MS - 1_000)
    table.join({
      socketId: 'sock-2-again',
      roomCode: ROOM_CODE,
      name: 'Bo',
      token: bo.token,
    })
    tick(10_000)

    expect(table.expireDisconnected()).toEqual([])
    expect(seatOf(table, 'seat-2')).toMatchObject({
      name: 'Bo',
      eliminated: false,
      handCount: 5,
    })
  })

  it('calls a draw when the last seats time out together', () => {
    const { table, tick } = setup()
    startedMatch(table, ['Ada', 'Bo'])

    table.disconnect('sock-1')
    table.disconnect('sock-2')
    tick(DISCONNECT_TIMEOUT_MS)

    expect(table.expireDisconnected()).toEqual(['seat-1', 'seat-2'])
    expect(table.publicState()).toMatchObject({
      phase: 'matchOver',
      turnSeatId: null,
      matchResult: { draw: true },
    })
  })

  it('reopens a slot instead of eliminating when no match is running', () => {
    const { table, tick } = setup()
    join(table, 1, 'Ada')
    join(table, 2, 'Bo')

    table.disconnect('sock-1')
    tick(DISCONNECT_TIMEOUT_MS)

    expect(table.expireDisconnected()).toEqual(['seat-1'])
    expect(seatOf(table, 'seat-1')).toMatchObject({
      name: null,
      isHost: false,
      eliminated: false,
    })
    // The host role follows, or the table could never start a match again.
    expect(seatOf(table, 'seat-2').isHost).toBe(true)
  })
})

describe('rematch', () => {
  it('is host-only and needs two connected players', () => {
    const { table, tick } = setup(LETHAL_HAND)
    startedMatch(table, ['Ada', 'Bo'])
    playOutTurn(table, 'sock-1')

    expect(table.newMatch({ socketId: 'sock-2' })).toEqual({
      ok: false,
      reason: 'only the host can start a new match',
    })

    table.disconnect('sock-2')
    tick(DISCONNECT_TIMEOUT_MS)
    table.expireDisconnected()

    expect(table.newMatch({ socketId: 'sock-1' })).toEqual({
      ok: false,
      reason: 'need at least 2 players',
    })
  })

  it('reopens the vacated seat and resets the table, host intact', () => {
    const { table, tick } = setup(LETHAL_HAND)
    startedMatch(table, ['Ada', 'Bo'])
    playOutTurn(table, 'sock-1')
    table.disconnect('sock-2')
    tick(DISCONNECT_TIMEOUT_MS)
    table.expireDisconnected()

    const newcomer = join(table, 3, 'Cy')
    expect(newcomer.seatId).toBe('seat-2')
    expect(table.newMatch({ socketId: 'sock-1' })).toEqual({ ok: true })

    const state = table.publicState()
    expect(state).toMatchObject({
      phase: 'inMatch',
      eliminationOrder: [],
      matchResult: null,
      lastPlayed: null,
    })
    expect(state.seats.filter((s) => s.name !== null)).toMatchObject([
      { seatId: 'seat-1', name: 'Ada', isHost: true, hp: 10, handCount: 5 },
      { seatId: 'seat-2', name: 'Cy', isHost: false, hp: 10, handCount: 5 },
    ])
  })

  it('refuses newMatch while a match is still running', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])

    expect(table.newMatch({ socketId: 'sock-1' })).toEqual({
      ok: false,
      reason: 'no finished match to restart',
    })
  })
})

describe('display client', () => {
  it('accepts a display on the right room code only', () => {
    const { table } = setup()

    expect(table.joinAsDisplay({ roomCode: ROOM_CODE })).toEqual({ ok: true })
    expect(table.joinAsDisplay({ roomCode: 'ZZZZ' })).toEqual({
      ok: false,
      reason: 'wrong room code',
    })
  })

  it('reports which sockets need a private hand broadcast', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    table.disconnect('sock-2')

    expect(table.seatedSockets()).toEqual([
      { socketId: 'sock-1', seatId: 'seat-1' },
    ])
  })
})
