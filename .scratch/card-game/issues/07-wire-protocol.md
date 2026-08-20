Status: resolved
Type: grilling
Blocked by: 01, 02, 03, 04

## Question

Pin the exact socket.io wire contract and server-authoritative state shape, in `@card-game/shared`'s style (see `shared/src/index.ts`'s existing `ServerToClientEvents`/`ClientToServerEvents` pattern). This is the synthesis ticket: it waits on every other grilling ticket because each adds events/state fields (turn timer expiry, reconnect handshake, elimination-by-timeout, match-end/new-match, elimination view) that belong in the same contract rather than bolted on piecemeal.

Resolve:
- Full `ClientToServerEvents` list: join (name + room code), start, play-card (card id + optional target seat), and whatever [Turn pacing](01-turn-pacing.md), [Reconnect & idle-timeout mechanics](02-reconnect-timeout.md), and [Post-match / restart flow](03-postmatch-flow.md) added.
- Full `ServerToClientEvents` list: state-sync (full table state, broadcast on every change — state is small, no need to diff), plus any errors/rejections for illegal plays.
- The `Table`/`Seat` state shape (per `CONTEXT.md`'s terms): fields, types, what's broadcast to everyone vs private to a seat's own hand (a player's hand must not leak to other player clients or the display).
- Whether actions are fire-and-forget or ack'd (does the player client know a play succeeded before the next state-sync arrives?).
- Module/file layout: where these types and the state machine live across `shared`/`server`/`client`.

This is the last ticket before the frontier closes — once it resolves, compile `.scratch/card-game/spec.md` from every closed ticket's answer.

## Answer

**Architectural decisions:**
- Room code kept for the display connection too (not load-bearing for v1's single-table setup, reserved for future multi-table support) — supplied via a distinct `joinAsDisplay(roomCode)` event, server-injected into the display page at serve time (no human input, preserving "accepts no input").
- Every client→server action is acked — `join`, `joinAsDisplay`, `start`, `playCard`, `newMatch` — no fire-and-forget path, no separate rejection broadcast; failures resolve their own ack with `{ ok: false, reason }`.
- Hand privacy: a public `tableState` broadcast to every connected socket (hand **counts** only) plus a private `yourHand` event sent only to the socket owning that seat (full card details). This is the wire-level mechanism that makes "hands don't leak" (from `CONTEXT.md`) actually true.
- One `join(roomCode, name, token?)` event handles both fresh join and reconnect — a valid token reclaims that seat; otherwise the caller claims a fresh open seat.
- Module layout: `shared/src/index.ts` holds wire-contract types only (events + state shapes, no logic, matching its existing convention). `server/src/gameState.ts` holds the actual state machine (a pure module, richer than the public shape — decks, discard piles, per-seat tokens, socket↔seat mapping, disconnect timestamps for the 60s timer never cross the wire). `server/src/index.ts` stays socket.io wiring only: one `Table` instance at startup (per ADR-0001), delegates to `gameState.ts`, re-broadcasts after every mutation. `client/src/socket.ts` is a thin typed wrapper around `socket.io-client`; no game logic duplicated client-side.
- No visual distinction for "disconnected but not yet eliminated" — the server tracks it internally to run the reconnect timeout, but it's never on the wire and no client shows anything different until the seat either reconnects (invisible) or gets auto-eliminated (the already-designed eliminated state). Consistent with the v1-minimal-scope decision; called out explicitly so it's a choice, not a silent gap.

**Concrete contract** (`shared/src/index.ts`, grown in place from the existing `hello` placeholder):

```typescript
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

export type LastPlayed = { type: CardType; value?: number; bySeatId: string } | null

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
export type JoinResult = { ok: true; seatId: string; token: string } | { ok: false; reason: string }

export interface ServerToClientEvents {
  tableState: (state: PublicTableState) => void
  yourHand: (hand: HandCard[]) => void // sent only to the socket owning that seat
}

export interface ClientToServerEvents {
  join: (input: { roomCode: string; name: string; token?: string }, ack: (result: JoinResult) => void) => void
  joinAsDisplay: (input: { roomCode: string }, ack: (result: ActionResult) => void) => void
  start: (ack: (result: ActionResult) => void) => void
  playCard: (input: { cardId: string; targetSeatId?: string }, ack: (result: ActionResult) => void) => void
  newMatch: (ack: (result: ActionResult) => void) => void
}
```
