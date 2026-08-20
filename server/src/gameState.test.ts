import { describe, expect, it } from 'vitest'
import type { PublicSeat } from '@card-game/shared'
import { DECK_SIZE } from './cards'
import {
  createTable,
  DISCONNECT_TIMEOUT_MS,
  type Table,
  type TableOptions,
} from './gameState'
import {
  deckOrderedBy,
  RED_CHAIN_OPENER,
  RED_OPENER,
  seededRandom,
} from './testFixtures'

const ROOM_CODE = 'ABCD'
const LAN_ADDRESS = '192.168.1.20:3001'

function setup(
  opening: string[] = RED_OPENER,
  overrides: Partial<TableOptions> = {},
) {
  let clock = 10_000
  const table = createTable({
    roomCode: ROOM_CODE,
    lanAddress: LAN_ADDRESS,
    now: () => clock,
    // Zero, not `seededRandom()`: with `DECK_IDS` always offered in the same
    // order, this makes deck assignment deterministic — the Nth joiner always
    // gets the Nth still-available class (red, green, blue, yellow, in that
    // order for a table nobody has left).
    random: () => 0,
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

/** Seats `names` and starts the match with the first seat as host. Joined in
 *  order, so under this file's `setup` the classes land red/green/blue/yellow. */
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

function cardOfDef(table: Table, seatId: string, defId: string) {
  const card = table.handFor(seatId).find((c) => c.defId === defId)
  if (!card) throw new Error(`no ${defId} in ${seatId}'s hand`)
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

/** Always targets the named seat. */
const alwaysTarget =
  (seatId: string): PickTarget =>
  (opponents) =>
    opponents.find((seat) => seat.seatId === seatId)

/** Every card is legal now, so this plays whatever is first in hand — no
 *  "first legal card" search needed — targeting it only when the card asks
 *  for one. A single call plays through an entire `playAgain` chain too,
 *  since the loop keeps going as long as `turnSeatId` hasn't moved on. */
function playOutTurn(
  table: Table,
  socketId: string,
  pickTarget: PickTarget = (opponents) => opponents[0],
) {
  const seatId = table.seatIdForSocket(socketId)
  if (!seatId) throw new Error(`${socketId} is not seated`)
  for (let guard = 0; guard < 20; guard++) {
    if (table.publicState().turnSeatId !== seatId) return
    const [card] = table.handFor(seatId)
    if (!card) return
    const opponents = table
      .publicState()
      .seats.filter(
        (s) => s.name !== null && !s.eliminated && s.seatId !== seatId,
      )
    play(
      table,
      socketId,
      card,
      card.needsTarget ? pickTarget(opponents)?.seatId : undefined,
    )
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
    expect(seatOf(table, 'seat-1')).toMatchObject({
      name: 'Ada',
      isHost: true,
    })
    expect(seatOf(table, 'seat-2')).toMatchObject({
      name: 'Bo',
      isHost: false,
    })
  })

  it('assigns each joiner a distinct class deck, announced on join', () => {
    const { table } = setup()

    join(table, 1, 'Ada')
    join(table, 2, 'Bo')
    join(table, 3, 'Cy')
    join(table, 4, 'Di')

    expect(table.publicState().seats.map((s) => s.deckId)).toEqual([
      'red',
      'green',
      'blue',
      'yellow',
    ])
  })

  it("frees a vacated seat's deck for the next joiner", () => {
    const { table, tick } = setup()
    join(table, 1, 'Ada')
    join(table, 2, 'Bo')
    expect(seatOf(table, 'seat-2').deckId).toBe('green')

    table.disconnect('sock-2')
    tick(DISCONNECT_TIMEOUT_MS)
    table.expireDisconnected()
    expect(seatOf(table, 'seat-2').deckId).toBeNull()

    join(table, 3, 'Cy')
    expect(seatOf(table, 'seat-2').deckId).toBe('green')
  })

  it('mints a distinct token per seat', () => {
    const { table } = setup(RED_OPENER, { random: seededRandom() })

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

  it('reclaims the same seat by token, keeping its name and deck, ignoring the supplied name', () => {
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

    expect(reclaimed).toEqual({
      ok: true,
      seatId: 'seat-1',
      token: first.token,
    })
    expect(seatOf(table, 'seat-1')).toMatchObject({
      name: 'Ada',
      deckId: 'red',
    })
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

  it('deals three cards to each seat and hands the first seat the turn', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo', 'Cy'])
    const state = table.publicState()

    expect(state.phase).toBe('inMatch')
    expect(state.turnSeatId).toBe('seat-1')
    expect(state.chainCount).toBe(0)
    expect(
      state.seats.filter((s) => s.name !== null).map((s) => s.handCount),
    ).toEqual([3, 3, 3])
    expect(state.seats.filter((s) => s.name !== null).map((s) => s.hp)).toEqual(
      [10, 10, 10],
    )
    expect(table.handFor('seat-1')).toHaveLength(3)
    expect(table.handFor('seat-4')).toEqual([])
  })

  it('keeps a seat that dropped inside its 60s window', () => {
    const { table, tick } = setup()
    join(table, 1, 'Ada')
    join(table, 2, 'Bo')

    table.disconnect('sock-2')
    tick(5_000)

    expect(table.start({ socketId: 'sock-1' })).toEqual({ ok: true })
    expect(seatOf(table, 'seat-2')).toMatchObject({ name: 'Bo', handCount: 3 })
  })
})

describe('playing a card', () => {
  it('never rejects a play — a heal at full HP just clamps instead of being illegal', () => {
    const { table } = setup([...RED_OPENER, 'lay_on_hands'])
    startedMatch(table, ['Ada', 'Bo', 'Cy', 'Di']) // red, green, blue, yellow
    playOutTurn(table, 'sock-1')
    playOutTurn(table, 'sock-2')
    playOutTurn(table, 'sock-3')
    expect(table.publicState().turnSeatId).toBe('seat-4')
    expect(seatOf(table, 'seat-4').hp).toBe(10)

    const heal = cardOfDef(table, 'seat-4', 'lay_on_hands')
    const result = table.playCard({ socketId: 'sock-4', cardId: heal.id })

    expect(result).toEqual({ ok: true })
    expect(seatOf(table, 'seat-4').hp).toBe(10) // clamped, not rejected
  })

  it('ends the turn after exactly one card, no play-until-cant', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])

    play(table, 'sock-1', cardOfDef(table, 'seat-1', 'cinder_ward'))

    expect(table.publicState().turnSeatId).toBe('seat-2')
    // Discarded one, then refilled straight back to 3 as part of ending the
    // turn — not deferred to the next time it's this seat's turn.
    expect(seatOf(table, 'seat-1').handCount).toBe(3)
  })

  it('lets a playAgain card keep the turn, without refilling mid-chain', () => {
    const { table } = setup(RED_CHAIN_OPENER) // kindle, kindle, flame_lash
    startedMatch(table, ['Ada', 'Bo'])
    expect(seatOf(table, 'seat-1').handCount).toBe(3)

    play(table, 'sock-1', cardOfDef(table, 'seat-1', 'kindle'), 'seat-2')
    expect(table.publicState()).toMatchObject({
      turnSeatId: 'seat-1',
      chainCount: 1,
    })
    expect(seatOf(table, 'seat-1').handCount).toBe(2) // no refill mid-chain

    play(table, 'sock-1', cardOfDef(table, 'seat-1', 'kindle'), 'seat-2')
    expect(table.publicState()).toMatchObject({
      turnSeatId: 'seat-1',
      chainCount: 2,
    })
    expect(seatOf(table, 'seat-1').handCount).toBe(1)

    // flame_lash has no playAgain — this ends the turn and refills.
    play(table, 'sock-1', cardOfDef(table, 'seat-1', 'flame_lash'), 'seat-2')
    expect(table.publicState()).toMatchObject({
      turnSeatId: 'seat-2',
      chainCount: 0,
    })
    expect(seatOf(table, 'seat-1').handCount).toBe(3)
    expect(seatOf(table, 'seat-2').hp).toBe(10 - 1 - 1 - 3)
  })

  it('persists a shield across turns instead of expiring', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo', 'Cy'])

    play(table, 'sock-1', cardOfDef(table, 'seat-1', 'cinder_ward'))
    expect(seatOf(table, 'seat-1').shields).toBe(1)

    // Nobody attacks Ada, so her shield is still up when her turn comes round.
    playOutTurn(table, 'sock-2', alwaysTarget('seat-3'))
    playOutTurn(table, 'sock-3', alwaysTarget('seat-2'))

    expect(table.publicState().turnSeatId).toBe('seat-1')
    expect(seatOf(table, 'seat-1').shields).toBe(1)
  })

  it('lets a draw effect push the hand above 3', () => {
    const { table } = setup(['foragers_find']) // green-only name; a no-op for red
    startedMatch(table, ['Ada', 'Bo'])
    playOutTurn(table, 'sock-1')
    expect(seatOf(table, 'seat-2').handCount).toBe(3)

    play(table, 'sock-2', cardOfDef(table, 'seat-2', 'foragers_find'))

    expect(seatOf(table, 'seat-2').handCount).toBe(4) // 3 - 1 discarded + 2 drawn
  })

  it('auto-targets the sole living opponent without a targetSeatId', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])

    const attack = cardOfDef(table, 'seat-1', 'ember_bolt')
    const result = table.playCard({ socketId: 'sock-1', cardId: attack.id })

    expect(result).toEqual({ ok: true })
    expect(seatOf(table, 'seat-2').hp).toBe(8)
  })

  it('requires an explicit target with two or more living opponents', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo', 'Cy'])

    const attack = cardOfDef(table, 'seat-1', 'ember_bolt')

    expect(table.playCard({ socketId: 'sock-1', cardId: attack.id })).toEqual({
      ok: false,
      reason: 'target required',
    })
    expect(
      table.playCard({
        socketId: 'sock-1',
        cardId: attack.id,
        targetSeatId: 'seat-1',
      }),
    ).toEqual({ ok: false, reason: 'invalid target' })
  })

  it('rejects a play from a seat that is not on turn, or a card not in hand', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    const card = cardOfDef(table, 'seat-2', 'thornstrike')

    expect(table.playCard({ socketId: 'sock-2', cardId: card.id })).toEqual({
      ok: false,
      reason: 'not your turn',
    })
    expect(table.playCard({ socketId: 'sock-1', cardId: card.id })).toEqual({
      ok: false,
      reason: 'card not in hand',
    })
  })

  it("reshuffles a seat's discard pile once its draw pile runs dry", () => {
    // Yellow's five zero-damage cards (shield/heal/harmless-draw only), front
    // of Di's deck — the class decks are attack-heavy by design, so without
    // this a match ends (someone hits 0 HP) long before any one seat's
    // 15-card deck cycles round to needing a reshuffle. Targeting the weakest
    // living opponent (rather than the healthiest) converges Ada/Bo/Cy's
    // fights onto each other and leaves the self-sustaining Di alone long
    // enough to play deep into her own deck.
    const yellowSelfOnly = [
      'sun_ward',
      'sun_ward',
      'lay_on_hands',
      'lay_on_hands',
      'revelation',
    ]
    const shuffledPiles: number[] = []
    const order = deckOrderedBy(yellowSelfOnly)
    const { table } = setup(yellowSelfOnly, {
      // Only a freshly built deck can be put in a fixed order; a reshuffle is
      // handed the discard pile, which holds whatever happened to be played.
      shuffleDeck: (cards) => {
        shuffledPiles.push(cards.length)
        return cards.length === DECK_SIZE ? order(cards) : [...cards]
      },
    })
    startedMatch(table, ['Ada', 'Bo', 'Cy', 'Di']) // Di = yellow, seat-4

    for (let turn = 0; turn < 200; turn++) {
      const seatId = table.publicState().turnSeatId
      if (!seatId) break
      const seats = table.publicState().seats
      const weakest = [...seats]
        .filter((s) => s.name !== null && !s.eliminated && s.seatId !== seatId)
        .sort((a, b) => a.hp - b.hp)[0]
      playOutTurn(table, socketFor(seatId), () => weakest)
    }

    const reshuffles = shuffledPiles.filter(
      (size) => size > 0 && size < DECK_SIZE,
    )
    expect(reshuffles.length).toBeGreaterThan(0)
  })

  it('never puts card contents in the public state', () => {
    const { table } = setup()
    startedMatch(table, ['Ada', 'Bo'])
    const [card] = table.handFor('seat-1')
    if (!card) throw new Error('no cards were dealt')

    const serialized = JSON.stringify(table.publicState())
    expect(serialized).not.toContain(card.id)
    expect(serialized).not.toContain(card.name)
  })
})

describe('elimination', () => {
  it('eliminates a seat once cumulative damage reaches 0 HP, clearing its cards and skipping its turn', () => {
    const { table } = setup(['immolate', 'immolate', 'flame_lash'])
    startedMatch(table, ['Ada', 'Bo', 'Cy'])

    for (
      let guard = 0;
      guard < 12 && !seatOf(table, 'seat-2').eliminated;
      guard++
    ) {
      const seatId = table.publicState().turnSeatId
      if (!seatId) break
      playOutTurn(table, socketFor(seatId))
    }

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
    const { table } = setup(['immolate', 'immolate', 'flame_lash'])
    startedMatch(table, ['Ada', 'Bo'])

    for (
      let guard = 0;
      guard < 6 && !seatOf(table, 'seat-2').eliminated;
      guard++
    ) {
      const seatId = table.publicState().turnSeatId
      if (!seatId) break
      playOutTurn(table, socketFor(seatId))
    }

    expect(table.publicState()).toMatchObject({
      phase: 'matchOver',
      turnSeatId: null,
      matchResult: { winnerSeatId: 'seat-1' },
      eliminationOrder: ['seat-2'],
    })
  })

  it('rejects a play from an eliminated seat', () => {
    const { table } = setup(['immolate', 'immolate', 'flame_lash'])
    startedMatch(table, ['Ada', 'Bo', 'Cy'])

    for (
      let guard = 0;
      guard < 12 && !seatOf(table, 'seat-2').eliminated;
      guard++
    ) {
      const seatId = table.publicState().turnSeatId
      if (!seatId) break
      playOutTurn(table, socketFor(seatId))
    }

    expect(
      table.playCard({
        socketId: 'sock-2',
        cardId: 'anything',
        targetSeatId: 'seat-1',
      }),
    ).toEqual({ ok: false, reason: 'you are eliminated' })
  })
})

describe('disconnect handling', () => {
  it('ends the turn (and any active chain) of a seat that drops mid-turn, draw step included', () => {
    const { table } = setup(RED_CHAIN_OPENER)
    startedMatch(table, ['Ada', 'Bo', 'Cy'])
    play(table, 'sock-1', cardOfDef(table, 'seat-1', 'kindle'), 'seat-2') // playAgain
    expect(table.publicState().turnSeatId).toBe('seat-1')
    expect(seatOf(table, 'seat-1').handCount).toBe(2)

    table.disconnect('sock-1')

    expect(table.publicState()).toMatchObject({
      turnSeatId: 'seat-2',
      chainCount: 0,
    })
    expect(seatOf(table, 'seat-1').handCount).toBe(3)
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
      shields: 0,
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
      handCount: 3,
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
      deckId: null,
      isHost: false,
      eliminated: false,
    })
    // The host role follows, or the table could never start a match again.
    expect(seatOf(table, 'seat-2').isHost).toBe(true)
  })
})

describe('rematch', () => {
  it('is host-only and needs two connected players', () => {
    const { table, tick } = setup(['immolate', 'immolate', 'flame_lash'])
    startedMatch(table, ['Ada', 'Bo'])
    for (
      let guard = 0;
      guard < 6 && !seatOf(table, 'seat-2').eliminated;
      guard++
    ) {
      const seatId = table.publicState().turnSeatId
      if (!seatId) break
      playOutTurn(table, socketFor(seatId))
    }

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

  it('reopens the vacated seat with a fresh deck and resets the table, host and deck intact', () => {
    const { table, tick } = setup(['immolate', 'immolate', 'flame_lash'])
    startedMatch(table, ['Ada', 'Bo'])
    for (
      let guard = 0;
      guard < 6 && !seatOf(table, 'seat-2').eliminated;
      guard++
    ) {
      const seatId = table.publicState().turnSeatId
      if (!seatId) break
      playOutTurn(table, socketFor(seatId))
    }
    table.disconnect('sock-2')
    tick(DISCONNECT_TIMEOUT_MS)
    table.expireDisconnected()

    const newcomer = join(table, 3, 'Cy')
    expect(newcomer.seatId).toBe('seat-2')
    expect(seatOf(table, 'seat-2').deckId).toBe('green') // the freed deck
    expect(table.newMatch({ socketId: 'sock-1' })).toEqual({ ok: true })

    const state = table.publicState()
    expect(state).toMatchObject({
      phase: 'inMatch',
      eliminationOrder: [],
      matchResult: null,
      lastPlayed: null,
      chainCount: 0,
    })
    expect(state.seats.filter((s) => s.name !== null)).toMatchObject([
      {
        seatId: 'seat-1',
        name: 'Ada',
        isHost: true,
        hp: 10,
        handCount: 3,
        deckId: 'red',
      },
      {
        seatId: 'seat-2',
        name: 'Cy',
        isHost: false,
        hp: 10,
        handCount: 3,
        deckId: 'green',
      },
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
