// Wire-contract types only — no logic. See `.scratch/card-game/spec.md`'s
// "Wire protocol" section; `server/src/gameState.ts` holds the richer internal
// state that never crosses the wire.

/** Path the display client reads its server-injected room code + LAN address
 *  from, per spec.md's "Join / reconnect" — nobody types a room code into the
 *  display. Shared so the client's fetch and the server's route can't drift. */
export const DISPLAY_CONFIG_PATH = '/display-config'

export type CardType = 'Attack' | 'Defense' | 'Heal'

export interface HandCard {
  id: string
  type: CardType
  value?: number // absent for Defense
  legal: boolean // per game-mechanics.md's legal-play conditions
}

export interface PublicSeat {
  seatId: string
  name: string | null // null = open, unclaimed
  isHost: boolean
  hp: number
  shielded: boolean
  eliminated: boolean
  handCount: number // count only — contents are private, see `yourHand`
}

export type LastPlayed = {
  type: CardType
  value?: number
  bySeatId: string
} | null

export type MatchResult = { winnerSeatId: string } | { draw: true }

export interface PublicTableState {
  roomCode: string
  lanAddress: string
  phase: 'lobby' | 'inMatch' | 'matchOver'
  seats: PublicSeat[]
  turnSeatId: string | null // null in lobby/matchOver
  lastPlayed: LastPlayed
  eliminationOrder: string[] // seatIds, in the order they were eliminated
  matchResult: MatchResult | null // set once phase === 'matchOver'
}

export type ActionResult = { ok: true } | { ok: false; reason: string }

export type JoinResult =
  | { ok: true; seatId: string; token: string }
  | { ok: false; reason: string }

export interface ServerToClientEvents {
  tableState: (state: PublicTableState) => void
  yourHand: (hand: HandCard[]) => void // sent only to the socket owning that seat
}

export interface ClientToServerEvents {
  join: (
    input: { roomCode: string; name: string; token?: string },
    ack: (result: JoinResult) => void,
  ) => void
  joinAsDisplay: (
    input: { roomCode: string },
    ack: (result: ActionResult) => void,
  ) => void
  start: (ack: (result: ActionResult) => void) => void
  playCard: (
    input: { cardId: string; targetSeatId?: string },
    ack: (result: ActionResult) => void,
  ) => void
  newMatch: (ack: (result: ActionResult) => void) => void
}
