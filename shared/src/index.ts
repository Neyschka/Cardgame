// Wire-contract types only — no logic. Rules source of truth is
// `docs/game-mechanics.md` (rewritten): 1 card per turn, 3-card hand,
// numeric shields, combined effects.

/** Path the display client reads its server-injected room code + LAN address
 *  from, per spec.md's "Join / reconnect" — nobody types a room code into the
 *  display. Shared so the client's fetch and the server's route can't drift. */
export const DISPLAY_CONFIG_PATH = '/display-config'

export type EffectKind = 'attack' | 'shield' | 'heal' | 'draw' | 'strip'

// attack, strip: 'single' = chosen opponent, 'all' = every living opponent.
// shield, heal, draw: always resolve on the player who played the card.
export type TargetMode = 'single' | 'all'

export interface CardEffect {
  kind: EffectKind
  value: number
  target: TargetMode
}

export type DeckId = 'red' | 'green' | 'blue' | 'yellow'

export interface HandCard {
  id: string // instance id, unique within this hand
  defId: string // card definition id — also the art filename
  name: string
  effects: CardEffect[]
  playAgain: boolean
  needsTarget: boolean // any effect with target 'single' and kind attack|strip
}

export interface PublicSeat {
  seatId: string
  name: string | null // null = open, unclaimed
  deckId: DeckId | null // random on join; null only for unclaimed seats
  isHost: boolean
  hp: number
  shields: number // 0..MAX_SHIELDS, each point absorbs 1 damage
  eliminated: boolean
  handCount: number // count only — contents are private, see `yourHand`
}

export type LastPlayed = {
  defId: string
  name: string
  effects: CardEffect[]
  bySeatId: string
  targetSeatId: string | null
} | null

export type MatchResult = { winnerSeatId: string } | { draw: true }

export interface PublicTableState {
  roomCode: string
  lanAddress: string
  phase: 'lobby' | 'inMatch' | 'matchOver'
  seats: PublicSeat[]
  turnSeatId: string | null // null in lobby/matchOver
  chainCount: number // consecutive playAgain plays this turn, 0 normally
  lastPlayed: LastPlayed
  eliminationOrder: string[] // seatIds, in elimination order
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
