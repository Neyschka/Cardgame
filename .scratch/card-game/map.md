# Card Game — LAN Multiplayer Spec

Label: wayfinder:map

**Destination reached**: `.scratch/card-game/spec.md` is compiled from every closed ticket below; a follow-on implementation task breakdown lives at `.scratch/card-game/tasks.md`.

## Destination

A spec at `.scratch/card-game/spec.md`, detailed enough to hand to a cold implementer with zero open design decisions left: exact socket.io wire contracts and server-authoritative state shape, display-client and player-client layouts/interactions, and the lobby/pacing/reconnect/elimination/post-match flows — built on top of `docs/game-mechanics.md` (fixed, not up for revisit) and this repo's existing `client`/`server`/`shared` skeleton.

## Notes

- Domain vocabulary: `CONTEXT.md` (Match, Table, Seat, Host, Room code, Display client, Player client).
- Architecture already decided: `docs/adr/0001-lan-only-single-origin-single-table.md` — LAN-only, one process serves client + server, one table per server instance, room code is a lightweight seat-claim gate (not multi-tenancy).
- Grilling tickets: call the "grilling" skill, and "domain-modeling" too if a new term surfaces.
- Prototype tickets: call the "prototype" skill; link the resulting throwaway artifact from the ticket.
- Tickets live in `.scratch/card-game/issues/`. Once the frontier is empty, compile the resolved decisions into `.scratch/card-game/spec.md` — that compile step is the destination itself, not a ticket.

### Locked decisions (destination-naming grill, not tickets — no single ticket to link)

- Destination is a hand-off spec, built in this repo (not a separate build effort).
- LAN-only; single table per server instance.
- Player identity: name-only, ephemeral, no accounts.
- Join: typed room code (not QR), lightweight gate.
- Display client: view-only, no input; same process also serves it (LAN IP:port + room code).
- Reconnect: auto-rejoin same seat via a localStorage session token.
- Match start: first joiner is host; Start enabled at 2 players, capped at 4.
- V1 scope: mechanics doc + bare lobby/name-entry/win screen only — placeholder visuals, no chat/sound/animation/art.
- Spec must pin exact contracts/shapes/module layout — nothing left to decide.
- Verification: browser-tab emulation is the assumed dev loop; real hardware not assumed available.

## Decisions so far

- [Turn pacing & timers](issues/01-turn-pacing.md): No time limit on turns or plays — colocated players self-police pace. No "turn expired" wire event, no countdown UI; timeout handling lives entirely in the reconnect/idle-timeout ticket.
- [Reconnect & idle-timeout mechanics](issues/02-reconnect-timeout.md): Match-scoped localStorage session token; 60s disconnect timeout auto-eliminates a seat (same rules as 0-HP elimination). Disconnected seats auto-pass their turn instantly — the match never pauses for them.
- [Post-match flow](issues/03-postmatch-flow.md): Rematch in place via a host-triggered "New Match" control (reuses the Start mechanic) — same table, host, and reopened seats for anyone who dropped. Display shows winner + elimination order; player clients show a minimal "match over" state.
- [Eliminated player experience](issues/04-eliminated-player-experience.md): Eliminated player's own client shows a static "you're eliminated" screen only, no table view. Their seat stays visible on the display client, marked as eliminated rather than disappearing.
- [Design display client layout](issues/05-display-client-layout.md): Ring table, seats at fixed cardinal positions (N/S, N/E/S, or N/E/S/W), face-down hand-count fans, center shows the last-played card face-up (or join count in lobby). No Start/New Match control here — display is view-only, so those live on the host's player client instead. Prototype on branch `prototype/display-client-layout`.
- [Design player client layout & interaction](issues/06-player-client-layout.md): 2-column card grid, select-then-play persistent action bar, full-screen target picker for Attacks. Lobby: roster + host-only Start button (New Match deferred to the win/restart screen ticket). Prototype landed directly on `main` (`client/prototype-player.html`, `client/src/prototype-player/`) by explicit one-off user call, not the usual throwaway branch — inert since it isn't part of the default Vite build, but flagged as cleanup debt.
- [Pin the exact wire contract](issues/07-wire-protocol.md): Every action acked (no fire-and-forget); public `tableState` broadcast (hand counts only) + private `yourHand` event enforces hand privacy; one `join` event handles fresh-join and token reconnect; display connects via a separate server-injected `joinAsDisplay(roomCode)`. `shared` = types only, `server/src/gameState.ts` = the actual state machine, `server/src/index.ts` = socket wiring, `client/src/socket.ts` = thin typed wrapper. Full concrete `shared/src/index.ts` contract recorded on the ticket.
- [Design win/restart screen](issues/08-win-restart-screen-layout.md): Display's ring-table center shows winner/draw + elimination-order chain + non-interactive "waiting for host" hint; player's match-over state is a plain message plus a host-only "New match" button mirroring Start's enabled/disabled rule. Prototype landed directly on `main`, same as 06.

## Not yet specified

_(none — every fog patch has either resolved into a ticket above or been covered by an already-locked decision. The frontier is empty; only the `spec.md` compile step remains, which is the destination itself, not a ticket.)_

## Out of scope

- Spectator viewers beyond the display client (no separate "watch only" phone role).
- Persistent accounts or stats across matches (identity is ephemeral, per-session).
- Multi-table / multi-tenant server support (ADR-0001: one table per instance).
- Real card art, theming, sound, animation, chat.
- Internet-hosted deployment beyond LAN (ADR-0001).
