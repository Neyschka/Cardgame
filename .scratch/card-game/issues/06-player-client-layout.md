Status: resolved
Type: prototype
Blocked by: 01

## Question

Design the player client's layout: the phone screen a seated player uses. Placeholder visuals only (text/color, no card art), per the v1 scope decision.

Cover:
- Join screen: name entry + room code entry.
- In-hand view: the player's own hand, each card showing its type/value, legal cards playable and illegal ("dead," per `docs/game-mechanics.md`) cards visibly disabled rather than hidden.
- Targeting: how a player picks which living opponent an Attack card hits (only relevant input beyond "play this card").
- Own HP/shield status, whose turn it currently is (including "waiting, not your turn" state).
- Whatever [Turn pacing](01-turn-pacing.md) decided: a visible countdown element, if one exists and applies to the player client.
- Host-only Start control (lobby) and New Match control (post-match) — per [Design display client layout](05-display-client-layout.md)'s resolution, the display client is view-only and accepts no input, so both controls live here, on the host's own player client, not on the display.

Build a throwaway prototype (static mock or clickable stub) to react to; link it from this ticket's resolution rather than pasting it inline.

## Answer

**Grid + persistent action bar + full-screen targeting.** Hand renders as a 2-column grid of square cards (icon, type, value); tapping a legal card selects it (highlighted border) without playing it. A persistent bottom bar reads "Play {selected card}", disabled until a legal card is selected. For an Attack, tapping Play opens a full-screen target picker listing only living opponents; Defense/Heal would play directly (no target step). Illegal ("dead") cards stay in the grid, greyed and disabled, with a one-line reason (e.g. "already shielded") instead of being hidden.

**Join screen**: name + room code fields, Join button.

**Lobby**: roster of joined names; host view adds a Start button (disabled below 2 players, with a "Need at least 2 players" reason shown in place of the label); guest view instead shows "Waiting for the host to start…". This is the Start half of the ticket's host-control bullet — the New Match half (post-match) is deliberately not designed here; it's [Design win/restart screen](08-win-restart-screen-layout.md)'s job together with the rest of the post-match screen, so that ticket's scope has been updated to say so explicitly.

**Turn/status**: own HP as a large number + shield badge at top-center; turn state as a pill ("Your turn" / "{name}'s turn"). When it's not your turn, the whole hand grid dims and stops accepting taps rather than disappearing.

**No timer/countdown UI** anywhere, per Turn pacing & timers' resolution.

Prototype (3 variants explored; Variant C chosen as-is, no further tweaks requested): `client/prototype-player.html` + `client/src/prototype-player/`. Note — by the user's explicit call this time ("fine for now"), this landed directly on `main` rather than a throwaway branch (the usual capture convention for this map); it's inert in production since this project's Vite build only bundles `index.html` by default, so it doesn't ship, but it's tech debt to clean up before the real implementation lands in these paths.
