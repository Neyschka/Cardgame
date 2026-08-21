Status: resolved
Type: prototype
Blocked by: 01

## Question

Design the display client's layout: the view-only screen shown on the shared TV/monitor, rendering the table (per `CONTEXT.md`) for everyone in the room. Placeholder visuals only (text/color, no card art), per the v1 scope decision.

Cover:
- Lobby state: joined seats, room code + LAN address for others to join, host-only Start button, min/max player enforcement (2–4).
- In-match state: all seats' HP, shield status, whose turn it is, turn order; how a 2-player layout differs from a 4-player one.
- Whatever [Turn pacing](01-turn-pacing.md) decided: a visible countdown element, if one exists.
- Win/draw state is owned by [Post-match / restart flow](03-postmatch-flow.md), not this ticket — leave a placeholder region for it rather than designing it here.
- Eliminated-seat treatment, per whatever [Eliminated player's client experience](04-eliminated-player-experience.md) decides (may resolve after this ticket starts — coordinate or leave it as a follow-up tweak).

Build a throwaway prototype (static mock or clickable stub) to react to; link it from this ticket's resolution rather than pasting it inline.

## Answer

**Ring table layout.** Seats sit at fixed cardinal positions around a central table — North/South for 2 players, North/East/South for 3, all four of North/East/South/West for 4 — rather than a seat list or grid. Each seat box shows name, host crown, HP bar, and shield status; the currently-active seat gets a glowing gold border. A face-down card-back fan renders below each seat, sized to that seat's hand count (no card values, just the count — hand contents are private to the player client).

The center of the table is dual-purpose: in the lobby it shows a plain "N/4 joined" readout; once the match starts, it shows the most recently played card face-up (type icon, value, and who played it) — this replaced the ticket's original vaguer "table state" idea in the middle and reads well as the shared point of attention on a TV everyone's watching.

**Eliminated seats** stay in their cardinal slot, dimmed, marked "OUT", hand fan hidden — per Eliminated player experience's resolution.

**No timer/countdown element anywhere** — per Turn pacing & timers' resolution (no per-turn time limit exists).

**Win/draw state**: left as a placeholder region only, per Post-match flow — actual design is Design win/restart screen's job.

**Correction to the original ticket's "host-only Start button" cover item**: no Start (or New Match) control lives on this client. `CONTEXT.md` defines the display client as view-only, accepting no input — the host triggers Start/New Match from their own player client instead (consistent with Post-match flow's resolution, which already put the "New Match" control on the host's phone). The display's lobby state shows join progress and the room code/LAN address only, no button.

Prototype (3 variants explored, Variant A chosen, then refined per feedback to cardinal seating + face-down hand fans + face-up center card): branch `prototype/display-client-layout`.

## Comments

**2026-08-21**: The `game-update/` rules migration changed some of the details here without touching the layout itself. Shield status is a numeric pip count (0–4), not a boolean. The center's last-played card now shows its art, name, and a pill per effect (from `effects`), not a "type icon, value" pair — cards can carry more than one effect. Seat boxes are also tinted by the seat's class (`deckId`), which didn't exist when this ticket was answered. Current behavior lives in `client/src/display/RingTable.tsx`; `spec.md`'s "Display client" section is the current design description.
