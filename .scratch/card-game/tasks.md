# Card Game — Implementation Task Breakdown

Implementation plan derived from `.scratch/card-game/spec.md`, once the design map's frontier closed with nothing left to decide. Each task below is scoped to be handed to a separate agent/session; dependencies are stated explicitly so independent tasks can run in parallel.

Every task should treat `spec.md` as the source of truth for behavior — this file only sequences the work and states per-task deliverables/acceptance criteria, it doesn't restate the design.

## Dependency graph

```
01 shared types
 ├──> 02 server game-state machine ──> 03 server socket wiring ──┐
 ├──> 04 display client (buildable in parallel, using the        │
 │     existing prototype as a base; needs 03 for live wiring) ──┤
 └──> 05 player client (same shape as 04) ──────────────────────>┴──> 06 integration & cleanup
```

01 blocks everything. 02→03 is a strict chain (wiring needs the state machine). 04 and 05 can each start as soon as 01 lands and don't block each other. 06 is the only task that needs everything else done first.

---

## 01 — Shared wire-contract types

**Depends on**: nothing.

Implement `spec.md`'s "Wire protocol" section verbatim in `shared/src/index.ts`, replacing the current `hello` placeholder (`ServerToClientEvents`/`ClientToServerEvents`/`createHelloMessage`) with the real `CardType`, `HandCard`, `PublicSeat`, `LastPlayed`, `MatchResult`, `PublicTableState`, `ActionResult`, `JoinResult` types and the real `ServerToClientEvents`/`ClientToServerEvents` interfaces.

**Deliverables**: updated `shared/src/index.ts`; updated `shared/src/index.test.ts` (drop the `hello`-message test, this package has no runtime logic to test until a helper is added — a type-only package can have an empty/trivial test file or none, per what's actually left to verify).

**Acceptance criteria**: `server` and `client` both type-check against the new exports with no `any`/`ts-ignore` needed to bridge the old shape.

---

## 02 — Server game-state machine

**Depends on**: 01.

Implement `server/src/gameState.ts` as a pure module (per spec.md's "Module layout") holding the actual state machine: seat join/reclaim/reopen, `start`, turn/play resolution (legality per `docs/game-mechanics.md`), elimination (0 HP and the 60s idle-timeout — see spec.md's "Reconnect & idle-timeout" and "Turn pacing" sections), rematch. Internal state is richer than `PublicTableState` (decks, discard piles, per-seat tokens, socket↔seat mapping, disconnect timestamps) — see spec.md's "Public vs. internal state".

**Deliverables**: `server/src/gameState.ts` + unit tests covering: seat claim/reclaim-by-token, `start`'s 2–4 gate, full turn resolution for each card type's legality rules, the auto-pass-on-disconnect turn behavior, 0-HP and 60s-timeout elimination (identical rules, one code path), win/draw detection, rematch reopening a vacated seat.

**Acceptance criteria**: a projection function exists that turns the internal state into `PublicTableState` for a given viewer (used by 03); no test needs a live socket connection — this module has zero socket.io dependency.

---

## 03 — Server socket wiring

**Depends on**: 01, 02.

Implement `server/src/index.ts` as socket.io wiring only (per spec.md's "Module layout" and the full ack semantics in "Wire protocol"): one `Table`/`gameState` instance at startup, each of `join`/`joinAsDisplay`/`start`/`playCard`/`newMatch` delegates to `gameState.ts` and resolves its ack; every mutation re-broadcasts `tableState` to all connected sockets and `yourHand` to each seated socket individually. The display's room code is server-injected at serve time (spec.md's "Join / reconnect" section) — no code-entry UI exists for it.

**Deliverables**: updated `server/src/index.ts`; integration tests using a real (in-process) socket.io server + client covering: join → tableState broadcast → yourHand received only by the joining socket, illegal `playCard` rejected via ack with no state change, disconnect → reconnect-by-token before 60s restores the same seat, disconnect → 60s elapses → elimination broadcast.

**Acceptance criteria**: no game logic lives in this file — everything routes through `gameState.ts`; a hand's contents never appear in a `tableState` payload in any test.

---

## 04 — Display client

**Depends on**: 01 (types); full live-data integration additionally depends on 03.

Fold the validated prototype decisions into real components under `client/src/`, replacing the throwaway `client/src/prototype-display/` code (captured on branch `prototype/display-client-layout`) and `client/src/prototype-winscreen/`'s display half. Implement spec.md's "Display client" section: cardinal-seat ring table, face-down hand-count fans, phase-dependent center (lobby join-count / in-match last-played card / match-over winner+elimination-order), eliminated-seat treatment. Wire it to the real `tableState` broadcast via `client/src/socket.ts` (shared with 05) instead of the prototype's local mock data.

**Deliverables**: real display-client components (route/entry point per whatever the project's eventual routing convention is — none exists yet, so this task also decides that concretely, e.g. a `?display` query param or a `/display` path, and records the choice); `client/src/socket.ts` (or its display-relevant slice) typed against `shared`.

**Acceptance criteria**: rendering is driven entirely by `tableState` broadcasts — no local game-state logic; verified via browser-tab emulation against a running `server` (per spec.md's verification note) through a full lobby → in-match → match-over cycle.

---

## 05 — Player client

**Depends on**: 01 (types); full live-data integration additionally depends on 03.

Fold the validated prototype decisions into real components under `client/src/`, replacing the throwaway `client/src/prototype-player/` code and `client/src/prototype-winscreen/`'s player half (both currently on `main`, not a throwaway branch — delete the prototype directories as part of this task rather than leaving them alongside the real implementation). Implement spec.md's "Player client" section: join screen, lobby (host Start / guest waiting), 2-column hand grid with select-then-play action bar, full-screen Attack targeting, turn/status pill, eliminated screen, match-over screen with host-only New Match. Wire it to `yourHand`/`tableState` and the ack-based actions via `client/src/socket.ts` (shared with 04).

**Deliverables**: real player-client components; the reconnect-token localStorage read/write on top of the `join` event (spec.md's "Join / reconnect" section).

**Acceptance criteria**: hand contents render only from `yourHand`, never inferred from `tableState`; a reconnect within 60s of a simulated disconnect restores the same seat and hand without a fresh `join` losing progress; verified via browser-tab emulation through a full join → play → eliminate/win cycle.

---

## 06 — Integration & cleanup

**Depends on**: 02, 03, 04, 05.

End-to-end pass with all pieces live together: multiple browser tabs as separate seats plus one as the display, playing a full match to a win and a rematch, per spec.md's verification note. Delete every remaining prototype artifact still on `main` (`client/prototype-player.html`, `client/src/prototype-player/`, `client/prototype-winscreen.html`, `client/src/prototype-winscreen/` — see spec.md's "Known cleanup debt") once the real components fully replace what they demonstrated.

**Deliverables**: none beyond the deletions above — this task is verification + cleanup, not new functionality.

**Acceptance criteria**: no `prototype-*` paths remain in `client/`; a full match (2–4 simulated players) completes lobby → in-match → elimination(s) → win/draw → rematch without manual intervention beyond the defined user actions.
