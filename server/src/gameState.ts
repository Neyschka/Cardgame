// The table's state machine, as a pure module: no socket.io import lives here.
// `index.ts` (task 03) owns the sockets, calls in, and broadcasts whatever comes
// back out. See `.scratch/card-game/spec.md` ("Module layout", "Public vs.
// internal state") for the split, and `docs/game-mechanics.md` for the rules
// this file encodes. Vocabulary follows `CONTEXT.md` — this is the Table; only
// the file path stays `gameState.ts`, because spec.md's module layout pins it.

import type {
  ActionResult,
  CardType,
  HandCard,
  JoinResult,
  LastPlayed,
  MatchResult,
  PublicSeat,
  PublicTableState,
} from '@card-game/shared'

const SEAT_COUNT = 4
const MIN_PLAYERS = 2
const STARTING_HP = 10
const MAX_HP = 10
const HAND_SIZE = 5
const HEAL_AMOUNT = 2

/** A disconnected seat is eliminated (mid-match) or reopened (between matches)
 *  once it has been gone this long — spec.md's "Reconnect & idle-timeout". */
export const DISCONNECT_TIMEOUT_MS = 60_000

export interface Card {
  id: string
  type: CardType
  value?: number
}

/** Every deck is the same 15 cards: 8 Attack (3×1, 3×2, 2×3), 4 Defense, 3 Heal. */
const DECK_TEMPLATE: ReadonlyArray<Omit<Card, 'id'>> = [
  { type: 'Attack', value: 1 },
  { type: 'Attack', value: 1 },
  { type: 'Attack', value: 1 },
  { type: 'Attack', value: 2 },
  { type: 'Attack', value: 2 },
  { type: 'Attack', value: 2 },
  { type: 'Attack', value: 3 },
  { type: 'Attack', value: 3 },
  { type: 'Defense' },
  { type: 'Defense' },
  { type: 'Defense' },
  { type: 'Defense' },
  { type: 'Heal', value: HEAL_AMOUNT },
  { type: 'Heal', value: HEAL_AMOUNT },
  { type: 'Heal', value: HEAL_AMOUNT },
]

/** Internal seat — richer than `PublicSeat`. Deck, discard, token, socket id and
 *  disconnect timestamp never cross the wire. */
interface Seat {
  seatId: string
  name: string | null
  isHost: boolean
  hp: number
  shielded: boolean
  eliminated: boolean
  hand: Card[]
  deck: Card[]
  discard: Card[]
  token: string | null
  socketId: string | null
  disconnectedAt: number | null
}

export interface TableOptions {
  roomCode: string
  lanAddress: string
  /** Injectable clock; only the disconnect timeout reads it. */
  now?: () => number
  /** Injectable RNG, used to mint reconnect tokens and drive the shuffles. */
  random?: () => number
  /** Deck-order seam — tests inject a fixed order for deterministic hands. */
  shuffleDeck?: (cards: Card[]) => Card[]
  /** Turn-order seam — same reason. */
  shuffleTurnOrder?: (seatIds: string[]) => string[]
}

export interface Table {
  join(input: {
    socketId: string
    roomCode: string
    name: string
    token?: string
  }): JoinResult
  joinAsDisplay(input: { roomCode: string }): ActionResult
  start(input: { socketId: string }): ActionResult
  playCard(input: {
    socketId: string
    cardId: string
    targetSeatId?: string
  }): ActionResult
  newMatch(input: { socketId: string }): ActionResult
  /** A socket dropped. Ends its turn if it was on one; starts the 60s clock. */
  disconnect(socketId: string): void
  /** Applies the 60s rule to every disconnected seat. Returns the seat ids it
   *  changed, so the wiring knows whether a re-broadcast is due. */
  expireDisconnected(): string[]
  /** The projection onto the wire shape. Viewer-independent by design: hand
   *  contents are never in here for *any* viewer — they come from `handFor`. */
  publicState(): PublicTableState
  handFor(seatId: string): HandCard[]
  seatIdForSocket(socketId: string): string | null
  seatedSockets(): { socketId: string; seatId: string }[]
}

export function createTable(options: TableOptions): Table {
  const now = options.now ?? (() => Date.now())
  const random = options.random ?? Math.random
  const shuffleDeck = options.shuffleDeck ?? makeShuffle<Card>(random)
  const shuffleTurnOrder = options.shuffleTurnOrder ?? makeShuffle<string>(random)

  let nextCardId = 0

  const state = {
    phase: 'lobby' as PublicTableState['phase'],
    seats: buildSeats(),
    turnOrder: [] as string[],
    turnSeatId: null as string | null,
    lastPlayed: null as LastPlayed,
    eliminationOrder: [] as string[],
    matchResult: null as MatchResult | null,
  }

  // --- lookups ------------------------------------------------------------

  const seatById = (seatId: string) =>
    state.seats.find((seat) => seat.seatId === seatId)

  const seatBySocket = (socketId: string) =>
    state.seats.find((seat) => seat.socketId === socketId)

  const isOccupied = (seat: Seat) => seat.name !== null
  const isLiving = (seat: Seat) => isOccupied(seat) && !seat.eliminated
  const livingSeats = () => state.seats.filter(isLiving)

  /** Held by nobody and past its 60s window — safe to eliminate or reopen. A
   *  seat inside the window still counts as its player's: a phone refresh must
   *  not cost them the seat, whatever else the table does meanwhile. */
  const isAbandoned = (seat: Seat) =>
    isOccupied(seat) &&
    seat.disconnectedAt !== null &&
    now() - seat.disconnectedAt >= DISCONNECT_TIMEOUT_MS

  // --- seat lifecycle -----------------------------------------------------

  function bind(seat: Seat, socketId: string) {
    seat.socketId = socketId
    seat.disconnectedAt = null
  }

  function clearCards(seat: Seat) {
    seat.hand = []
    seat.deck = []
    seat.discard = []
  }

  /** Everything about a seat's play, minus who is sitting in it. */
  function resetPlay(seat: Seat) {
    seat.hp = STARTING_HP
    seat.shielded = false
    seat.eliminated = false
    clearCards(seat)
  }

  /** Wipes a seat back to an open slot. Its cards, token and host flag go too. */
  function vacate(seat: Seat) {
    seat.name = null
    seat.isHost = false
    seat.token = null
    seat.socketId = null
    seat.disconnectedAt = null
    resetPlay(seat)
  }

  /** Host is tied to a seat, not re-derived per match — but if that seat is
   *  vacated the role has to move, or nobody can ever start a match again. */
  function reassignHost() {
    const occupied = state.seats.filter(isOccupied)
    if (occupied.length === 0 || occupied.some((seat) => seat.isHost)) return
    const [first] = occupied
    if (first) first.isHost = true
  }

  /** The seat a fresh join lands in: the first open slot, or — between matches —
   *  an abandoned one (spec.md's rematch seat reopening). */
  function claimableSeat(): Seat | undefined {
    const open = state.seats.find((seat) => !isOccupied(seat))
    if (open) return open
    if (state.phase !== 'matchOver') return undefined
    const abandoned = state.seats.find(isAbandoned)
    if (!abandoned) return undefined
    vacate(abandoned)
    return abandoned
  }

  /** Seat-scoped so two seats can never end up holding the same token, however
   *  poor the injected RNG is. The seat id is public in `tableState` anyway.
   *
   *  Note on lifetime: spec.md says a token is "invalidated once the match ends
   *  or a new match starts", but the wire contract has no way to hand a rotated
   *  token to an already-connected client (only the `join` ack carries one), so
   *  rotating one would break every post-match reconnect. A token instead dies
   *  with the seat it belongs to — cleared in `vacate`. */
  function mintToken(seatId: string) {
    const secret = Array.from({ length: 4 }, () =>
      Math.floor(random() * 0x10000)
        .toString(16)
        .padStart(4, '0'),
    ).join('')
    return `${seatId}-${secret}`
  }

  /** Both start and newMatch are host-only actions from a seated socket. */
  function requireHost(socketId: string, action: string): ActionResult {
    const seat = seatBySocket(socketId)
    if (!seat) return { ok: false, reason: 'you are not seated' }
    if (!seat.isHost) return { ok: false, reason: `only the host can ${action}` }
    return { ok: true }
  }

  // --- cards --------------------------------------------------------------

  function buildDeck(seatId: string): Card[] {
    return DECK_TEMPLATE.map((card) => ({
      ...card,
      id: `${seatId}-c${nextCardId++}`,
    }))
  }

  function drawUpTo(seat: Seat, size: number) {
    while (seat.hand.length < size) {
      if (seat.deck.length === 0) {
        if (seat.discard.length === 0) return
        // Draw pile empty: the seat's own discard pile becomes the new one.
        seat.deck = shuffleDeck(seat.discard)
        seat.discard = []
      }
      const card = seat.deck.shift()
      if (!card) return
      seat.hand.push(card)
    }
  }

  /** Null when the card is playable; otherwise the reason it's a dead card.
   *  Mirrors game-mechanics.md's "Legal play conditions" — turn ownership is a
   *  separate check, so a dead card reads the same on and off your turn. */
  function illegalReason(seat: Seat, card: Card): string | null {
    if (card.type === 'Heal' && seat.hp >= MAX_HP) return 'already at full HP'
    if (card.type === 'Defense' && seat.shielded) return 'already shielded'
    if (
      card.type === 'Attack' &&
      !livingSeats().some((other) => other.seatId !== seat.seatId)
    ) {
      return 'no living opponents'
    }
    return null
  }

  const hasLegalPlay = (seat: Seat) =>
    seat.hand.some((card) => illegalReason(seat, card) === null)

  // --- turns --------------------------------------------------------------

  function nextLivingSeatId(fromSeatId: string): string | null {
    const { turnOrder } = state
    if (turnOrder.length === 0) return null
    const from = Math.max(turnOrder.indexOf(fromSeatId), 0)
    for (let step = 1; step <= turnOrder.length; step++) {
      const candidate = turnOrder[(from + step) % turnOrder.length]
      const seat = candidate === undefined ? undefined : seatById(candidate)
      if (seat && isLiving(seat)) return seat.seatId
    }
    return null
  }

  /** Hands the turn to a seat, auto-passing straight through disconnected seats
   *  — an instant "no legal plays" turn, draw step included (spec.md's
   *  "Reconnect & idle-timeout"). Bounded by one lap: if every living seat is
   *  disconnected the turn parks until the 60s timeouts resolve the match. */
  function enterTurn(seatId: string) {
    let current: string | null = seatId
    for (let hop = 0; hop < state.turnOrder.length && current !== null; hop++) {
      const seat = seatById(current)
      if (!seat) return
      state.turnSeatId = seat.seatId
      // An unused shield expires at the start of that seat's next turn.
      seat.shielded = false
      if (seat.socketId !== null) return
      drawUpTo(seat, HAND_SIZE)
      const next = nextLivingSeatId(seat.seatId)
      current = next === seat.seatId ? null : next
    }
  }

  function endTurn(seat: Seat) {
    // Refill only what was actually played this turn; dead cards stay put.
    drawUpTo(seat, HAND_SIZE)
    const next = nextLivingSeatId(seat.seatId)
    if (next === null) {
      state.turnSeatId = null
      return
    }
    enterTurn(next)
  }

  // --- elimination & match end -------------------------------------------

  /** The system's one elimination mechanism: 0 HP and the 60s timeout both land
   *  here. Deck, hand and discard leave play; the seat is skipped from now on. */
  function eliminate(seat: Seat) {
    if (seat.eliminated) return
    seat.eliminated = true
    seat.shielded = false
    clearCards(seat)
    state.eliminationOrder.push(seat.seatId)
  }

  function resolveMatchEnd(): boolean {
    if (state.phase !== 'inMatch') return false
    const alive = livingSeats()
    if (alive.length > 1) return false
    const [survivor] = alive
    state.phase = 'matchOver'
    state.turnSeatId = null
    state.matchResult = survivor
      ? { winnerSeatId: survivor.seatId }
      : { draw: true }
    return true
  }

  function beginMatch(): ActionResult {
    const participants = state.seats.filter(
      (seat) => isOccupied(seat) && !isAbandoned(seat),
    )
    if (participants.length < MIN_PLAYERS) {
      return { ok: false, reason: `need at least ${MIN_PLAYERS} players` }
    }
    // Abandoned slots reopen for new players at rematch time. A seat still
    // inside its 60s window keeps its player and is dealt in as normal — turn
    // rotation auto-passes it until they reconnect.
    for (const seat of state.seats) {
      if (isAbandoned(seat)) vacate(seat)
    }
    reassignHost()
    for (const seat of participants) {
      resetPlay(seat)
      seat.deck = shuffleDeck(buildDeck(seat.seatId))
      drawUpTo(seat, HAND_SIZE)
    }
    state.phase = 'inMatch'
    state.lastPlayed = null
    state.eliminationOrder = []
    state.matchResult = null
    state.turnOrder = shuffleTurnOrder(participants.map((seat) => seat.seatId))
    const [first] = state.turnOrder
    if (first) enterTurn(first)
    return { ok: true }
  }

  // --- projections --------------------------------------------------------

  const toPublicSeat = (seat: Seat): PublicSeat => ({
    seatId: seat.seatId,
    name: seat.name,
    isHost: seat.isHost,
    hp: seat.hp,
    shielded: seat.shielded,
    eliminated: seat.eliminated,
    handCount: seat.hand.length,
  })

  return {
    join({ socketId, roomCode, name, token }) {
      if (roomCode !== options.roomCode) {
        return { ok: false, reason: 'wrong room code' }
      }
      if (token) {
        const claimed = state.seats.find(
          (seat) => seat.token === token && isOccupied(seat),
        )
        if (claimed) {
          // Reclaim: the supplied name is ignored, the seat keeps its own.
          bind(claimed, socketId)
          return { ok: true, seatId: claimed.seatId, token }
        }
        // A stale token (its seat was reopened) falls through to a fresh claim.
      }
      if (state.phase === 'inMatch') {
        return { ok: false, reason: 'match already in progress' }
      }
      const trimmed = name.trim()
      if (!trimmed) return { ok: false, reason: 'name required' }
      const seat = claimableSeat()
      if (!seat) return { ok: false, reason: 'table full' }
      seat.name = trimmed
      seat.token = mintToken(seat.seatId)
      bind(seat, socketId)
      reassignHost()
      return { ok: true, seatId: seat.seatId, token: seat.token }
    },

    joinAsDisplay({ roomCode }) {
      if (roomCode !== options.roomCode) {
        return { ok: false, reason: 'wrong room code' }
      }
      return { ok: true }
    },

    start({ socketId }) {
      const gate = requireHost(socketId, 'start the match')
      if (!gate.ok) return gate
      if (state.phase === 'inMatch') {
        return { ok: false, reason: 'match already in progress' }
      }
      if (state.phase === 'matchOver') {
        return { ok: false, reason: 'the match is over — start a new match' }
      }
      return beginMatch()
    },

    newMatch({ socketId }) {
      const gate = requireHost(socketId, 'start a new match')
      if (!gate.ok) return gate
      if (state.phase !== 'matchOver') {
        return { ok: false, reason: 'no finished match to restart' }
      }
      return beginMatch()
    },

    playCard({ socketId, cardId, targetSeatId }) {
      if (state.phase !== 'inMatch') {
        return { ok: false, reason: 'no match in progress' }
      }
      const seat = seatBySocket(socketId)
      if (!seat) return { ok: false, reason: 'you are not seated' }
      if (seat.eliminated) return { ok: false, reason: 'you are eliminated' }
      if (state.turnSeatId !== seat.seatId) {
        return { ok: false, reason: 'not your turn' }
      }
      const index = seat.hand.findIndex((card) => card.id === cardId)
      const card = seat.hand[index]
      if (!card) return { ok: false, reason: 'card not in hand' }
      const illegal = illegalReason(seat, card)
      if (illegal) return { ok: false, reason: illegal }

      let target: Seat | undefined
      if (card.type === 'Attack') {
        if (!targetSeatId) return { ok: false, reason: 'attack needs a target' }
        if (targetSeatId === seat.seatId) {
          return { ok: false, reason: 'you cannot target yourself' }
        }
        target = seatById(targetSeatId)
        if (!target || !isLiving(target)) {
          return { ok: false, reason: 'invalid target' }
        }
      }

      seat.hand.splice(index, 1)
      seat.discard.push(card)

      if (card.type === 'Attack' && target) {
        if (target.shielded) {
          // Flat negate, whatever the attack's value, and the shield is spent.
          target.shielded = false
        } else {
          target.hp = Math.max(0, target.hp - (card.value ?? 0))
          if (target.hp === 0) eliminate(target)
        }
      } else if (card.type === 'Heal') {
        seat.hp = Math.min(MAX_HP, seat.hp + (card.value ?? HEAL_AMOUNT))
      } else {
        seat.shielded = true
      }

      state.lastPlayed = {
        type: card.type,
        value: card.value,
        bySeatId: seat.seatId,
      }

      // Play-until-can't: the turn only ends when no legal play is left. The
      // wire contract has no `endTurn` event, so there is no "choose to stop".
      if (!resolveMatchEnd() && !hasLegalPlay(seat)) endTurn(seat)
      return { ok: true }
    },

    disconnect(socketId) {
      const seat = seatBySocket(socketId)
      if (!seat) return
      seat.socketId = null
      seat.disconnectedAt = now()
      if (
        state.phase === 'inMatch' &&
        state.turnSeatId === seat.seatId &&
        !seat.eliminated
      ) {
        // Dropping mid-turn ends that turn, draw step included.
        endTurn(seat)
      }
    },

    expireDisconnected() {
      const changed: string[] = []
      for (const seat of state.seats) {
        if (!isAbandoned(seat)) continue
        if (state.phase === 'inMatch') {
          if (seat.eliminated) continue
          eliminate(seat)
        } else {
          // Between matches there is no match to be eliminated from — the slot
          // reopens instead, so the table can't be deadlocked by a seat (or a
          // host) that never comes back.
          vacate(seat)
        }
        changed.push(seat.seatId)
      }
      if (changed.length === 0) return changed
      reassignHost()
      if (state.phase === 'inMatch' && !resolveMatchEnd()) {
        const current =
          state.turnSeatId === null ? undefined : seatById(state.turnSeatId)
        if (!current || current.eliminated) {
          const next = nextLivingSeatId(state.turnSeatId ?? '')
          if (next === null) state.turnSeatId = null
          else enterTurn(next)
        }
      }
      return changed
    },

    publicState() {
      return {
        roomCode: options.roomCode,
        lanAddress: options.lanAddress,
        phase: state.phase,
        seats: state.seats.map(toPublicSeat),
        turnSeatId: state.turnSeatId,
        lastPlayed: state.lastPlayed,
        eliminationOrder: [...state.eliminationOrder],
        matchResult: state.matchResult,
      }
    },

    handFor(seatId) {
      const seat = seatById(seatId)
      if (!seat) return []
      return seat.hand.map((card) => ({
        id: card.id,
        type: card.type,
        value: card.value,
        legal: illegalReason(seat, card) === null,
      }))
    },

    seatIdForSocket(socketId) {
      return seatBySocket(socketId)?.seatId ?? null
    },

    seatedSockets() {
      return state.seats.flatMap((seat) =>
        isOccupied(seat) && seat.socketId !== null
          ? [{ socketId: seat.socketId, seatId: seat.seatId }]
          : [],
      )
    },
  }
}

/** The four fixed slots. `PublicSeat.name === null` is how an open one reads on
 *  the wire, which is what drives the display's "N/4 joined". */
function buildSeats(): Seat[] {
  return Array.from({ length: SEAT_COUNT }, (_unused, index) => ({
    seatId: `seat-${index + 1}`,
    name: null,
    isHost: false,
    hp: STARTING_HP,
    shielded: false,
    eliminated: false,
    hand: [],
    deck: [],
    discard: [],
    token: null,
    socketId: null,
    disconnectedAt: null,
  }))
}

function makeShuffle<T>(random: () => number): (items: T[]) => T[] {
  return (items: T[]) => {
    const shuffled = [...items]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const swap = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = swap
    }
    return shuffled
  }
}
