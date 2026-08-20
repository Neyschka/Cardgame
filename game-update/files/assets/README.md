# Board assets — fantasy pass

Palette and typography matched to the card assets (`src/config.ts`).
Open `preview.html` via a local server (`npx serve .`) — it inlines the SVGs
via fetch, so `file://` will be blocked by CORS.

## Files

| File | Size | Notes |
|---|---|---|
| `board-bg.svg` | 1920x1080 | Violet table, gold trim, glowing centre play area |
| `player-panel-wide.svg` | 640x180 | North + south seats |
| `player-panel-tall.svg` | 260x460 | East + west seats |
| `hp-frame.svg` | 240x30 | Standalone HP bar |
| `shield-slot-empty.svg` | 52x36 | Empty ward slot |
| `shield-filled.svg` | 52x36 | Active ward |
| `shield-broken.svg` | 52x36 | Shatter state |
| `discard-slot-empty.svg` | 82x108 | Empty discard |
| `turn-indicator.svg` | 660x200 | Glowing gold ring, overlay on active seat (offset -10,-10) |

## Seat positions (top-left on the 1920x1080 board)

- North: 640, 70   (wide)
- South: 640, 830  (wide)
- West:  90, 310   (tall)
- East:  1570, 310 (tall)
- Centre play area: 600, 330 (720x420)

## Tinting — the important bit

Panels use `currentColor` for the accent bar, border, HP fill, portrait figure
and deck backing, plus a `#panel-tint` wash at 18% that colours the whole panel.
One file becomes four classes by setting CSS `color` on the wrapper.

This only works if the SVG is **inlined**, not loaded via `<img>`.
In React: `vite-plugin-svgr` or a `?raw` import, then
`<div style={{ color: CLASSES[id].border }}>`.

Use each class's `border` value from `config.ts` as the tint colour:
red `#ef4444`, green `#22c55e`, blue `#3b82f6`, yellow `#f59e0b`.

Text and bar widths in the SVGs are placeholders — render live names, HP
numbers and bar widths as DOM on top. Target ids: `#portrait`, `#nameplate`,
`#hp`, `#hp-fill`, `#shields`, `#deck`, `#discard`, `#panel-tint`.

## Palette

Table: `#07060f` void, `#3a2154`→`#1f1236`→`#0d0718` radial, `#2a1a44` play area
Panel: `#1b1030` body, `#120a22` insets
Gold: `#f0d98a` → `#c9a227` → `#8a6a14`, active turn `#fde68a`
Text: `#e4d5b8` parchment, `#c9a227` muted labels
Fonts: Cinzel (headings/numbers), EB Garamond (body) — same as the cards

---

# Lobby assets

Open `lobby-preview.html` (same local-server caveat).

| File | Size | Notes |
|---|---|---|
| `lobby-bg.svg` | 1920x1080 | "Gather Your Party" title, gold frame, join hint footer |
| `room-code-plate.svg` | 720x200 | Four glowing letter slots — place at 600, 200 |
| `lobby-slot-empty.svg` | 380x480 | Dashed waiting state |
| `lobby-slot-filled.svg` | 380x480 | Joined player, tinted via `currentColor` |
| `host-crown.svg` | 88x88 | Overlay on host slot, offset roughly -28 top / -20 right |
| `start-button.svg` | 340x96 | Controller-side, host only |
| `start-button-disabled.svg` | 340x96 | Fewer than 2 players joined |

## Slot positions (1920x1080)

Four across at y=470: x = 80, 540, 1000, 1460 (380 wide, 80 gaps).
Room code plate: 600, 200.

## Notes for the dev

- The room code letters in `room-code-plate.svg` are placeholders (`BLZK`).
  Render live characters as DOM over the `#code-slots` rects, or replace the
  `#code-text` group's four `<text>` nodes.
- `lobby-slot-filled.svg` tints exactly like the player panels — set CSS
  `color` on the wrapper to the class `border` colour from `config.ts`.
  Ids: `#slot-tint`, `#slot-edge`, `#portrait`, `#nameplate`, `#classname`, `#ready`.
- Join animation: the empty slot cross-fades to the filled slot. Framer Motion
  with a scale-in from 0.9 plus the gold border drawing in reads well and costs
  a few lines.
- The host crown is a separate overlay so it can be moved if the host leaves
  and hosting passes to the next player.
- `#ready` is a green READY line. If you don't implement a ready toggle, hide
  it or repurpose it as the class name.

---

# Phone screens

`phone-screens.html` — all three controller screens side by side. This one is
**HTML, not SVG, on purpose**: these are live UI with real text, tap states and
layout that must reflow, so a flat image would be the wrong deliverable. The
CSS custom properties at the top of the file are the design tokens — lift them
straight into the client.

Open it directly (`file://` is fine — nothing is fetched).

## Screens

**1 · Join** — title, four code boxes, name field, ENTER THE FRAY button.
Filled code boxes get a gold border and glow; empty ones stay dim.

**2 · Waiting room** — one row per seat, tinted by class, host marked with a
crown. Empty seats are dashed with "Awaiting a champion…". Host sees BEGIN
BATTLE; everyone else sees the disabled variant (`.btn.off`).

**3 · Hand** — opponent strip along the top (HP, shield count, greyed when
eliminated), turn banner, own HP bar and four shield pips, three cards along
the bottom. There is no selected state and no hint line: tapping a card goes
straight to screen 4 (or plays immediately, if no target is needed).

**4 · Choose a target** — see Targeting below.

## Supporting SVGs

| File | Size | Notes |
|---|---|---|
| `phone-bg.svg` | 390x844 | Backdrop if you'd rather not use the CSS gradient |
| `code-box.svg` | 68x84 | Single code-entry box, empty state |
| `turn-banner.svg` | 358x64 | "YOUR TURN" gold banner |
| `waiting-banner.svg` | 358x64 | "AWAIT YOUR TURN" dim banner |

## Notes for the dev

- **Cards show a stack of effect pills, not one symbol.** Every card can have
  multiple effects (`Shatter` = strip 1 + 2 damage), so the pill column is
  driven by `card.effects.map(...)`, not a single card type.
- Pill colours come from `ACTION_COLORS` in the card generator's `config.ts`,
  so hand cards match the printed cards: attack `#f87171`, shield `#60a5fa`,
  heal `#f472b6`, draw `#a78bfa`, strip `#fb923c`. Import that map rather than
  hard-coding these.
- **Shields are four discrete pips**, not a boolean icon — matches
  `MAX_SHIELDS = 4` and the board art.
- Card art slot is the empty rectangle inside each card — drop the per-card
  SVG in there, named `${defId}.svg`.
- Everything is sized for 390px wide (iPhone-ish). The layout uses flex with
  `margin-top:auto` on the hand, so taller screens push cards to the bottom
  rather than stretching them.

## Targeting

Screen 4 in `phone-screens.html`. Targeting is a **separate screen state**, not
a hint on the hand screen — on a phone, tapping a small strip at the top after
tapping a card at the bottom is a reliable source of mis-taps.

Flow:

1. Player taps a card. If `needsTarget(card.effects)` is false, or only one
   opponent lives (`autoTarget()` returns a seat), play immediately — never
   show this screen.
2. Otherwise go **straight** to this screen. There's no intermediate selected
   state on the hand screen and no confirm step — one tap on the card, one tap
   on the target, done.
3. The hand dims, the chosen card shows large with its effects in words, and
   each living opponent becomes a full-width row.
4. Tapping a row plays the card. The cancel button returns to the hand.

The `.card.sel` lift-and-glow style is still in the stylesheet — use it as the
press state during the transition, not as a resting state.

Notes:

- Rows show HP **and** shields, because shields are what the choice usually
  turns on — the blue player sitting on 4 shields is a different target from
  the green one on 2.
- Eliminated players are dimmed in the top strip and absent from the row list.
- Cards with `target: 'all'` skip this screen entirely; there's nothing to
  choose. If you want a confirm step for those, reuse the chosen-card block
  with a single PLAY button.

### Board-side markers

| File | Size | Notes |
|---|---|---|
| `target-reticle.svg` | 120x120 | Crosshair, centre on a seat's portrait |
| `target-marker-seat.svg` | 660x200 | Red corner brackets framing a whole seat panel — overlay at the seat position offset -10,-10 |

Use one or the other, not both. The seat marker reads better at projector
distance; the reticle is better if you're animating a strike landing.
