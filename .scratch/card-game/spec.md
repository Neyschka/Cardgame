# Card Game — LAN Multiplayer Spec

Hand-off spec for implementing the LAN multiplayer layer on top of `docs/game-mechanics.md` (card game rules — fixed, not revisited here) and this repo's existing `client`/`server`/`shared` npm-workspace skeleton. Domain vocabulary (Match, Table, Seat, Host, Room code, Display client, Player client) is defined in `CONTEXT.md` and used as-is throughout.

Everything below is a closed decision — nothing here is left for an implementer to judge. Where a decision traces back to a specific design ticket, the ticket is linked for the full reasoning; this document states the *what*, the tickets hold the *why*.

## Architecture (fixed, per ADR-0001)

- LAN-only. One server process serves both the built client and the socket.io server (one origin, one port). Phones and the display all reach it via `<host-ip>:<port>`.
- One server instance hosts exactly one table — no multi-tenant table routing. The room code is a lightweight seat-claim gate, not a table selector.
- Player identity is name-only and ephemeral — no accounts, nothing persists past a match's lifetime except via the reconnect token (below).
- Verification/dev-loop: browser-tab emulation is the assumed way to check this during development; real hardware isn't assumed available.

## Module layout

- **`shared/src/index.ts`** — wire-contract types only: the `ClientToServerEvents`/`ServerToClientEvents` interfaces and the `Table`/`Seat`/`Card` state shapes below. No logic. Grows in place from the existing `hello` placeholder.
- **`server/src/gameState.ts`** — the actual state machine as a pure module: seat management (join/reclaim/reopen), start, turn/play resolution, elimination (by HP or timeout), rematch. Operates on a server-internal state representation *richer* than the wire shape (see "Public vs. internal state" below).
- **`server/src/index.ts`** — socket.io wiring only. Creates one `Table` instance at startup (one table per server instance), each socket event handler delegates to `gameState.ts`, then re-broadcasts.
- **`client/src/socket.ts`** — a thin typed wrapper around `socket.io-client` exposing the events below. No game logic duplicated client-side; the client renders whatever the server broadcasts (server-authoritative).

## Wire protocol

Full contract ([Pin the exact wire contract](issues/07-wire-protocol.md)):

```typescript
// shared/src/index.ts

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

### Ack semantics

Every client→server action is acked — no fire-and-forget path, no separate rejection broadcast. A failed action resolves its own ack with `{ ok: false, reason }` (e.g. `join` rejects with a reason like "table full" or "match already in progress"; `playCard` rejects with a reason like "not your turn" or "illegal play"). A successful action's real effect is reflected by the next `tableState`/`yourHand` broadcast, which reaches every connected socket including the actor.

### Join / reconnect

One `join(roomCode, name, token?)` event handles both a fresh join and a reconnect:
- If `token` is present and matches a live seat's stored token, that seat is reclaimed (the supplied `name` is ignored).
- Otherwise, the caller claims the next open seat with the given `name` and the server mints a fresh token, returned in the ack (`{ ok: true, seatId, token }`) for the client to persist to `localStorage`.

The display client never calls `join`. It connects via a separate `joinAsDisplay(roomCode)` event, with the room code **server-injected into the display page at serve time** — no human types it in, preserving "display accepts no input." The room code isn't load-bearing for v1's single-table setup; it's kept on this event for forward-compatibility with a possible future multi-table server.

### Hand privacy

`tableState` broadcasts to every connected socket (seated or not) and carries **hand counts only** — never card contents. A private `yourHand` event, sent only to the socket that owns a seat, carries that seat's full hand (`HandCard[]`, with `legal` computed server-side per `game-mechanics.md`'s legality rules). This is the concrete mechanism that keeps a hand from leaking to other players or the display.

### Public vs. internal state

`PublicTableState` is what's ever broadcast. The server's real internal model is richer and never crosses the wire: each seat's deck/discard pile, its reconnect token, its owning socket id, and (for the reconnect timeout) a disconnect timestamp. In particular, there's **no wire-level or visual distinction between "disconnected but not yet eliminated" and "connected"** — the server tracks the disconnect internally to run the 60s timeout, but no client shows anything different until the seat either reconnects (invisible to everyone) or gets auto-eliminated (the normal eliminated-seat treatment kicks in). This is a deliberate v1-minimal-scope choice, not an oversight.

## Flows

### Lobby / join

- First socket to `join` a seat becomes host; only the host may call `start`.
- `start` succeeds once 2–4 seats are filled (`{ok:false, reason:"need at least 2 players"}` below 2); the server randomizes turn order once and deals starting hands per `game-mechanics.md`.
- Display client: connects via `joinAsDisplay`, shows the room code + LAN address and a live "N/4 joined" readout. Never shows a Start control (display is view-only).
- Player client: name + room-code entry screen. Once joined, guests see "Waiting for the host to start…"; the host sees a Start button, disabled (with a "Need at least 2 players" label) below 2 players.

### Turn pacing ([Turn pacing & timers](issues/01-turn-pacing.md))

No per-turn or per-play time limit. The acting player gets unlimited thinking time — this is a colocated LAN party game, so the room self-polices pace. No "turn expired" wire event exists, and no client shows any countdown UI. All timeout behavior is exclusively the reconnect/idle-timeout mechanism below — a connected, present player never times out, no matter how long they take.

### Reconnect & idle-timeout ([Reconnect & idle-timeout mechanics](issues/02-reconnect-timeout.md))

- A random token is minted on join, stored in the player client's `localStorage`, matched server-side on reconnect (see "Join / reconnect" above). Scoped to the current match only — invalidated once the match ends or a new match starts.
- A disconnected seat is auto-eliminated after **60 seconds** disconnected.
- Turn rotation auto-passes a disconnected seat instantly (treated as an instant "no legal plays" turn) — the match never pauses waiting on one dropped player. The 60s clock runs continuously in the background from the moment of disconnect, independent of whose turn it is; there's no separate/shorter grace period for an active turn.
- Auto-elimination-by-timeout uses identical rules to reaching 0 HP: deck/hand/discard removed from play, permanently skipped in future rotation. There is exactly one elimination mechanism in the system.

### Eliminated player experience ([Eliminated player experience](issues/04-eliminated-player-experience.md))

- An eliminated player's own client shows a static "you're eliminated" screen and nothing else — no read-only table view (the shared display already covers that for the room).
- An eliminated seat does not disappear from the display; it stays in its cardinal slot, dimmed/greyed, marked "OUT", its hand fan hidden.

### Post-match / rematch ([Post-match flow](issues/03-postmatch-flow.md))

- On match end (last-player-standing, or the rare simultaneous-elimination shared draw), the table enters `phase: 'matchOver'` with `matchResult` and `eliminationOrder` set.
- The host gets a `newMatch` control that reuses the `start` mechanic's rules verbatim (host-only, enabled at 2+ seats, capped at 4). It resets the same table in place: decks reshuffled, HP reset to 10, a fresh random turn order. No full leave-and-rejoin is required.
- The host role stays with the same seat/player across rematches (host is tied to the seat, not re-derived).
- A seat that was permanently disconnected (auto-eliminated by the 60s timeout) has its slot reopen at rematch time — a new player can claim it via the room code exactly like joining a fresh table.
- Session tokens don't survive past the match — see "Join / reconnect" above.

## Display client

Ring-table layout ([Design display client layout](issues/05-display-client-layout.md), prototype on branch `prototype/display-client-layout`; win/restart addition in [Design win/restart screen](issues/08-win-restart-screen-layout.md), prototype `client/prototype-winscreen.html` + `client/src/prototype-winscreen/` on `main`):

- Seats sit at fixed cardinal positions around a central table: North/South for 2 players, North/East/South for 3, all four of North/East/South/West for 4.
- Each seat box shows name, host crown, HP bar, shield status. The currently-active seat gets a glowing gold border. A face-down card-back fan renders below each seat, sized to that seat's `handCount` — never card contents.
- Eliminated seats stay in their slot, dimmed, marked "OUT", hand fan hidden.
- The table's center is phase-dependent:
  - **Lobby**: a plain "N/4 joined" readout, plus the room code and LAN address.
  - **In-match**: the most recently played card, face-up (type icon, value, who played it — from `lastPlayed`).
  - **Match over**: a gold-bordered card — 🏆 + winner name, or 🤝 + "Draw!" — with the full elimination order below it as an arrow-chain ending at the winner (the winner's seat also gets the gold highlight), plus a small non-interactive line: "Waiting for the host to start a new match…".
- No timer/countdown element anywhere on this client.
- No interactive control of any kind — the display client is strictly view-only; Start and New Match live only on the host's player client.

## Player client

Grid + persistent action bar layout ([Design player client layout & interaction](issues/06-player-client-layout.md), prototype `client/prototype-player.html` + `client/src/prototype-player/` on `main`; win/restart addition in [Design win/restart screen](issues/08-win-restart-screen-layout.md), prototype `client/prototype-winscreen.html` + `client/src/prototype-winscreen/` on `main`):

- **Join screen**: name + room-code fields, Join button.
- **Lobby**: roster of joined names. Host sees a Start button (disabled below 2 players, labeled "Need at least 2 players" while disabled). Guests see "Waiting for the host to start…".
- **In-hand view**: the hand renders as a 2-column grid of square cards (icon, type, value). Tapping a legal card selects it (highlighted border) without playing it; illegal ("dead") cards stay in the grid, greyed and disabled, with a one-line reason (e.g. "already shielded") rather than being hidden.
- **Play action bar**: a persistent bottom bar reads "Play {selected card}", disabled until a legal card is selected.
- **Targeting**: tapping Play on a selected Attack opens a full-screen target picker listing only living opponents. Defense/Heal play directly with no target step.
- **Status**: own HP as a large number + shield badge at top-center; turn state as a pill ("Your turn" / "{name}'s turn"). When it's not your turn, the whole hand grid dims and stops accepting taps (it never disappears).
- **Eliminated state**: a static "you're eliminated" screen and nothing else (see "Eliminated player experience" above) — this replaces the normal in-match view entirely for that seat.
- **Match over**: a plain centered "🏁 Match over — check the shared screen" card. The host additionally gets a "New match" button in the same style as the lobby's Start button, disabled below 2 players connected with the same "Need at least 2 players" label. Non-hosts get nothing further.
- No timer/countdown UI anywhere on this client.

## Out of scope

(Unchanged from the map — recorded here for the implementer's benefit, not re-litigated.)

- Spectator viewers beyond the display client (no separate "watch only" phone role).
- Persistent accounts or stats across matches (identity is ephemeral, per-session).
- Multi-table / multi-tenant server support (ADR-0001: one table per instance).
- Real card art, theming, sound, animation, chat.
- Internet-hosted deployment beyond LAN (ADR-0001).

## Known cleanup debt

Three prototype directories from the design process are sitting in `client/` on `main` rather than on throwaway branches (by explicit user choice during design, not the usual convention): `client/prototype-player.html` + `client/src/prototype-player/`, and `client/prototype-winscreen.html` + `client/src/prototype-winscreen/`. (A third, `client/prototype-display.html` + `client/src/prototype-display/`, correctly landed on branch `prototype/display-client-layout` instead.) None of these ship in production — this project's Vite build only bundles `index.html` by default — but they should be deleted once the real implementation replaces them.
