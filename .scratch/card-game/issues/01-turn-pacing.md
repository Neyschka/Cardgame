Status: resolved
Type: grilling

## Question

`docs/game-mechanics.md` defines turn structure (play-until-can't) but says nothing about pacing: is there any time limit on a turn or a single play, or does the acting player get unlimited thinking time?

Resolve:
- Is there a per-turn (or per-play) time limit at all? If yes, how long, and what happens on expiry — is the turn auto-ended (skip remaining plays for that turn), or is something more specific auto-played?
- Does the timer (if any) pause/reset on reconnect, and how does it interact with [Reconnect & idle-timeout mechanics](02-reconnect-timeout.md)'s idle-timeout — are they the same clock or two different ones (a short "hurry up" turn timer vs a longer "you've vanished" elimination timeout)?
- Does the display client and/or player client need to show a visible countdown, or is any timeout silent/generous enough not to need one?

This decision feeds the wire protocol (does a "turn expired" event exist?) and both client layouts (is there a timer UI element), so resolve it before those.

## Answer

No per-turn or per-play time limit. The acting player gets unlimited thinking time; this is a colocated LAN party game (shared display + everyone in the room), so the room self-polices pace rather than a clock enforcing it.

Consequences:
- No "turn expired" (or similar) event in the wire protocol.
- No countdown UI on the display client or player client.
- Pacing/timeout handling is entirely the concern of [Reconnect & idle-timeout mechanics](02-reconnect-timeout.md) — a disconnected seat still auto-eliminates on a timeout; a present, connected seat never does, regardless of how long they take.

## Comments

**2026-08-21**: The Question's "play-until-can't" description is the pre-migration turn structure; `docs/game-mechanics.md` now defines exactly-one-card-per-turn with optional `playAgain` chaining instead. This ticket's answer (no time limit, no countdown UI) is unaffected either way.
