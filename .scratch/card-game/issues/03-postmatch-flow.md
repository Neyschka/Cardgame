Status: resolved
Type: grilling

## Question

`docs/game-mechanics.md` defines a match as ending in last-player-standing (or a rare shared draw). Nothing yet defines what happens on the display or player clients once that happens, or how a fresh match begins afterward. Resolve:

- What does the display client show at match end — winner name (or draw state), final HP/elimination order, anything else?
- What do player clients show at match end — same info, or just a simple "match over" state?
- How does a new match start afterward: does the host get a "New Game" control that resets the same table with the same seats/players still connected (re-shuffled decks, fresh 10 HP, new random turn order), or must everyone leave and rejoin with the room code again?
- If seats persist across matches, does the host role stay with the same player, or does it re-derive (e.g. first-to-ready) each time?

This feeds the wire protocol (match-end and new-match events) and the display layout's win screen, so resolve it before [Design display client layout](05-display-client-layout.md) needs it (that ticket is already scoped to core layout; this ticket owns the win/restart screen specifically).

## Answer

- **New match**: rematch in place. The host gets a "New Match" control that reuses the original Start mechanic verbatim — host-only, triggered instantly from the host's own player client, no readiness-check from other seats, enabled once 2+ seats are filled and capped at 4. Resets the same table: decks reshuffled, HP reset to 10, a fresh random turn order. No full leave-and-rejoin required.
- **Host persistence**: the host stays the same player/seat across rematches — host is tied to the seat (first to claim it), not re-derived per match.
- **Seat reopening**: a seat that was permanently disconnected (auto-eliminated by the 60s idle timeout) has its slot reopen at rematch time — a new player can claim it via the room code exactly like joining a fresh table, subject to the same 2–4 player gate. A rematch's lobby is functionally identical to a fresh table's lobby, just with some seats pre-filled by players who stuck around.
- **Display client at match end**: winner name (or draw state) plus full elimination order (who went out in what order, ending with the winner). No final HP shown — dead players are at 0 anyway.
- **Player client at match end**: a minimal "match over, check the screen" state — no duplicated recap; the shared display already has it.

Note: this ticket decided the win/restart screen's *content and behavior*, not its visual layout — that's a follow-on prototype ticket (see [Design win/restart screen](08-win-restart-screen-layout.md)).
