Status: resolved
Type: prototype
Blocked by: 03

## Question

Design the display client's win/restart screen: the shared-screen state shown once a match ends, per [Post-match flow](03-postmatch-flow.md)'s resolution — winner name (or draw state) and full elimination order. Placeholder visuals only (text/color, no card art), per the v1 scope decision. No interactive control here — per [Design display client layout](05-display-client-layout.md)'s resolution the display is view-only.

Also cover the player client's corresponding "match over" state from the same resolution: a minimal "match over, check the screen" state for everyone, plus — since it's host-only and per [Design player client layout & interaction](06-player-client-layout.md)'s resolution it belongs here, not on the display — the host's "New Match" control (mirroring the lobby's Start control: disabled below 2 players, capped at 4).

## Answer

One cohesive mockup rather than a 3-variant switcher — this ticket only fills a placeholder region of layouts already locked (05, 06), so there was no real "what should this look like" ambiguity left to explore three ways.

**Display**: the ring table's center placeholder now shows, on match end, a gold-bordered card with 🏆 + winner name (or 🤝 + "Draw!"), the full elimination order beneath it as an arrow-chain ending at the winner, and a small non-interactive status line ("Waiting for the host to start a new match…"). Seats stay in their cardinal N/S/E/W positions exactly as in-match, eliminated ones dimmed/marked OUT as already decided; the surviving winner's seat gets the same gold highlight the active-turn seat used to get.

**Player**: a plain centered "🏁 Match over — check the shared screen" card, matching Variant C's dark phone-frame look. The host additionally gets a "New match" button in the same style as the lobby's Start button, disabled with a "Need at least 2 players" label below the 2-player minimum — non-hosts get nothing further.

Prototype: `client/prototype-winscreen.html` + `client/src/prototype-winscreen/`. Landed directly on `main` again by the user's explicit call, same as the player client layout prototype — not the usual throwaway branch. Inert in production (outside the default Vite build), but cleanup debt alongside the other two prototype directories still sitting in the tree (`prototype-player`, `prototype-winscreen`) once real implementation replaces them.

**This was the last open ticket — the map's frontier is now empty.**

## Comments

**2026-08-21**: The match-end mechanics described above are unaffected by the `game-update/` rules migration. The prototype files this ticket links (`client/prototype-winscreen.html`, `client/src/prototype-winscreen/`) have since been deleted — the real implementation replaced them.
