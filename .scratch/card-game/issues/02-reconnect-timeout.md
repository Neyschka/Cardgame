Status: resolved
Type: grilling

## Question

The destination-naming grill locked: refresh/brief drop auto-rejoins the same seat via a localStorage session token, and a permanent no-return eventually auto-eliminates the seat so the match can continue. The exact mechanics weren't pinned. Resolve:

- Session token: what identifies a seat for rejoin purposes — a random token minted on join, stored in the player client's localStorage, sent back on reconnect and matched server-side against the seat record? Does it expire ever (e.g. once the match ends)?
- Idle-timeout duration: how long does a seat wait, disconnected, before auto-elimination? (Pick a concrete number — this is the number referenced as "a spec-writing detail" during destination-naming; it still needs picking.)
- If the disconnect happens mid-turn (it's their turn and they vanish), does the timeout apply the same way, or is an active turn given a different (shorter/longer) grace period than an idle waiting seat?
- What happens to a seat's cards/HP state when it's auto-eliminated by timeout — same elimination rules as reaching 0 HP (removed from rotation), per `docs/game-mechanics.md`'s elimination rules?

This feeds the wire protocol (reconnect handshake, elimination-by-timeout event) and both client layouts (how a disconnected/reconnecting seat is shown), so resolve it before those.

## Answer

- **Session token**: a random token minted on join, stored in the player client's localStorage, sent back on reconnect and matched server-side against the seat record. Scoped to the current match only — invalidated once the match ends or a new match starts (matches the ephemeral, no-accounts identity decision; nothing outlives a match).
- **Idle-timeout duration**: 60 seconds disconnected before auto-elimination.
- **Turn rotation during disconnect**: auto-pass. Each time rotation reaches a disconnected seat, it's treated as an instant "no legal plays" turn and play moves on immediately to the next living player — the match never pauses waiting on one dropped player. The 60s elimination clock runs continuously in the background from the moment of disconnect, independent of whose turn it is (no separate/shorter grace period for an active turn — same single timer either way).
- **Auto-elimination consequences**: identical to reaching 0 HP per `docs/game-mechanics.md` — deck/hand/discard removed from play, permanently skipped in future turn rotation. One elimination mechanism for the whole system; no separate "eliminated-by-timeout" variant.

## Comments

**2026-08-21**: The "no legal plays" phrasing above is a holdover from the original play-until-can't rules. The `game-update/` rules migration removed the legality concept entirely — every card is always playable — so a disconnected seat's auto-passed turn is better described as a no-op (nobody's there to act), not a legality outcome. The mechanics themselves (60s timer, auto-pass, same elimination path) are unaffected.
