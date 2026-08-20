Status: resolved
Type: grilling

## Question

`docs/game-mechanics.md` says an eliminated player's deck/hand/discard are removed from play and they're skipped in turn rotation — but says nothing about what that player's own phone shows for the remainder of the match. Resolve:

- Does an eliminated player's client show a "you're eliminated" screen and nothing else, or can they keep watching the rest of the match unfold (a read-only view of the table, similar to what the display shows)?
- If they get a read-only view, is it worth building as its own state, or can it reuse the display client's view-only rendering (same component, different context)?
- Does an eliminated seat's row disappear from the display client entirely, or stay visible in some "eliminated" visual state (relevant to [Design display client layout](05-display-client-layout.md))?

This is a self-contained flow decision; it doesn't block or get blocked by the other grilling tickets, but its answer feeds both the wire protocol and the display layout ticket.

## Answer

- An eliminated player's own client shows a static "you're eliminated" screen and nothing else — no read-only table view. The shared display already renders the live table for the whole room, including eliminated players; a second read-only rendering path on the player client would duplicate that for no real benefit, and it's outside v1's minimal scope.
- An eliminated seat does **not** disappear from the display client. It stays visible, visually marked as eliminated (e.g. dimmed/greyed row), so the table's layout doesn't reshuffle mid-match and everyone can see at a glance who's still in it.
