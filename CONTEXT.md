# Card Game

A turn-based, free-for-all multiplayer card game (mechanics defined in `docs/game-mechanics.md`), played across two client roles: a shared display and individual player phones.

## Language

**Match**:
One complete game, from lobby to a single winner (or a shared draw on the rare simultaneous-elimination edge case) — no series or best-of-N structure.
_Avoid_: Game, round, session

**Table**:
The shared, server-authoritative state of a match: whose turn it is, every seat's HP and shield, and the current turn order. This is what the display client renders.
_Avoid_: Board, room, game state

**Seat**:
One player's slot at a table (2–4 per match), holding that player's own hand, deck, discard pile, HP, and shield.
_Avoid_: Slot, player slot

**Host**:
The player who claimed the first open seat at a table. The only seat allowed to trigger Start.
_Avoid_: Owner, admin

**Room code**:
A short code a player client types to claim a seat at a table. A lightweight join gate, not a selector between multiple tables — one server instance hosts exactly one table (see ADR-0001).
_Avoid_: Room ID, join code, PIN

**Display client**:
The view-only client run on the shared screen (TV/monitor). Renders the table for everyone to see; accepts no input.
_Avoid_: TV client, spectator client, board client

**Player client**:
The client run on a player's own phone. Shows only that seat's hand and lets them play their cards.
_Avoid_: Phone client, hand client

Card-level terms — Hand, Deck, Discard, Attack, Defense, Heal, Shield, HP — are defined in `docs/game-mechanics.md` and aren't restated here.
