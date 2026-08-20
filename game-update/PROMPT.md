# Rules migration — execution brief (against the shipped build)

The repo contains a complete, tested game on the old rules. This brief
migrates it to the new rules and applies the art pack. It is written against
the code as it exists — file names and line references below are real, not
hypothetical. Where the code has drifted from what's described, say so rather
than guessing.

**Order matters.** Engine first (with its tests), then wire, then clients,
then theme, then card art. Do not start the theme until the game plays
correctly under the new rules — a beautiful broken game is worse than an ugly
working one.

Everything you need is in `game-update/files/`.

---

## 1. The rules, in full

- 2–4 players, free-for-all, last player standing wins.
- Each player gets one of **four asymmetric 15-card class decks**
  (red / green / blue / yellow), assigned at random on join — no player
  chooses. Personal draw and discard piles, reshuffle discard when the draw
  pile empties.
- **10 HP**, capped — heals never overheal (by clamping, not legality).
- **Hand size 3.** Start-of-turn: draw until hand length is 3 (not "draw 1").
  Draw effects may push a hand above 3; then the next start-of-turn draw
  draws zero. Unplayed cards stay in hand.
- **Play exactly one card per turn.** No passing, no play-until-can't.
- `playAgain: true` on a card → the same player immediately plays again.
  Cap consecutive plays at `MAX_CHAIN = 5`.
- **Every card is always legal.** Delete the legality system: `legal`,
  `illegalReason`, `hasLegalPlay`, dead-card handling — all of it, server and
  client.
- **Shields are numeric points, 0–4** (`MAX_SHIELDS = 4`). Each point absorbs
  1 damage; excess carries through to HP. Shields **persist** — delete the
  expiry in `enterTurn` (`seat.shielded = false`).
- Cards carry an **effects list**; most do two things. Kinds: `attack`,
  `shield`, `heal`, `draw`, `strip`. `strip` destroys shield points on a
  target, floors at 0.
- Targeting: `single` = chosen living opponent, auto-target when exactly one
  remains; `all` = every living opponent. Shield/heal/draw always resolve on
  the actor.
- Simultaneous elimination of the final two (possible now via `all` attacks)
  is a draw — the existing `resolveMatchEnd` draw branch already covers it.

## 2. Replace the wire contract

Overwrite `shared/src/index.ts` with `files/shared/src/index.ts`.

It keeps `DISPLAY_CONFIG_PATH` (the display's boot fetch and the server route
both use it) and the entire event surface — `join`, `joinAsDisplay`, `start`,
`playCard`, `newMatch`, `tableState`, `yourHand` are unchanged in name and
shape. What changes: `HandCard` becomes id/defId/name/effects/playAgain/
needsTarget (no `type`, no `legal`); `PublicSeat` gains `deckId` and swaps
`shielded: boolean` for `shields: number`; `PublicTableState` gains
`chainCount`; `LastPlayed` becomes defId/name/effects/bySeatId/targetSeatId.

`PublicSeat.deckId` is `DeckId | null` — null only for unclaimed seats, since
decks are assigned on join. The lobby uses it for class name and colour.

## 3. Rewrite the engine core (`server/src/gameState.ts`)

Add `files/server/src/cards.ts` and `files/server/src/resolve.ts` as new
files. `resolve.ts` is pure (no socket.io) and exports `resolveCard`,
`validatePlay`, `needsTarget`, `autoTarget`, plus `STARTING_HP`, `HAND_SIZE`,
`MAX_SHIELDS`, `MAX_CHAIN`. Import constants from there — delete the local
`HAND_SIZE = 5`, `MAX_HP`, `HEAL_AMOUNT`.

**Keep, untouched:** seat claim/reclaim by token, `bind`/`vacate`,
`reassignHost`, disconnect + 60s idle elimination, `enterTurn`'s
auto-pass-through-disconnected-seats loop, `nextLivingSeatId`, `eliminate`,
`resolveMatchEnd`, rematch/`newMatch`, and all projection plumbing. That's
most of the file and none of it is rules-dependent.

**Delete:** `DECK_TEMPLATE`, `hasLegalPlay`, `illegalReason`, the
`seat.shielded = false` expiry line in `enterTurn`, and the boolean-shield
branch in `playCard`.

**Change:**
- Internal `Seat`: `shielded: boolean` → `shields: number`; hand holds the
  new `HandCard` shape; add `deckId`.
- Each player is dealt a **random class deck** — there is no deck-select UI
  and there should not be one. Assign at **join** time, not match start: when
  a seat is claimed, give it a random `DeckId` not already held by another
  occupied seat. Return it to the pool when a seat is vacated (`vacate`), and
  keep it on reclaim-by-token. This means the lobby can show each player's
  class and colour as they join, which the lobby art assumes.
- `beginMatch` then just uses `seat.deckId`:
  `seat.deck = shuffle(buildDeck(DECKS[seat.deckId]))`, deal 3 (not 5), and
  set `chainCount = 0`. On rematch, keep existing seats' decks; only newly
  claimed seats draw from the pool.
- `drawUpTo(seat, HAND_SIZE)` semantics survive as-is (draw until length 3;
  drawing zero when already ≥3 falls out naturally).
- `playCard` becomes:

  ```
  phase/seat/turn guards (keep as written)
  find card in hand
  targetId = input.targetSeatId ?? autoTarget(seats, actorId)
  validatePlay(card, targetId, ...)      → ack error on failure
  remove card from hand → discard
  events = resolveCard(card, actorId, targetId, seats, drawCard)
  set lastPlayed { defId, name, effects, bySeatId, targetSeatId }
  if resolveMatchEnd() → done
  if card.playAgain && chainCount < MAX_CHAIN:
      chainCount++            // same seat keeps the turn
  else:
      chainCount = 0
      endTurn(seat)           // draw up to 3, advance
  ```

- `eliminate` should zero `shields` (it currently clears `shielded`).
- The dealt `HandCard`s are built from `CardDef`s: instance `id` (unique),
  `defId = def.id`, `name`, `effects`, `playAgain: !!def.playAgain`,
  `needsTarget: needsTarget(def.effects)`.

**Tests:** the 31 tests in `gameState.test.ts` encode the old rules; most
will fail by design. Rewrite them around the new rules rather than patching
assertions one by one — the join/reconnect/host/timeout tests survive nearly
unchanged, the turn/legality tests are replaced. Add focused unit tests for
`resolve.ts`: shield absorb + carry-through, strip floors at 0, shield cap 4,
heal cap 10, `all` hits every living opponent, draw reshuffles the discard,
chain cap 5.

## 4. Update the player client

- `client/src/player/cards.ts`: delete `illegalReason`; replace
  `typeIcon`/`cardLabel` with an effects renderer. Each card shows a stack of
  effect pills, one per entry in `effects`. Colours (these are the card
  generator's `ACTION_COLORS`): attack `#f87171`, shield `#60a5fa`,
  heal `#f472b6`, draw `#a78bfa`, strip `#fb923c`. Strip is orange, not blue —
  a destroyed shield must not read as a gained one.
- `InMatch.tsx`: the target-picker flow already exists — rewire its trigger
  from `card.type === 'Attack'` to `card.needsTarget`, and skip the picker
  entirely when `livingOpponents.length === 1` or the card has no single-
  target attack/strip (play immediately). Remove disabled-card styling and
  illegal-reason messaging. One card per turn means the hand disappears into
  "waiting" state after a play unless `playAgain` kept the turn — drive that
  purely off `tableState.turnSeatId`, which the server already broadcasts.
- Shield display: replace the single 🛡 with up to 4 pips (own status) and a
  `n 🛡` count on opponents.
- `Lobby.tsx`: show each seated player's class name and colour from
  `seat.deckId` (`CLASS_NAMES` maps red → Pyromancer, green → Sylvan Ranger,
  blue → Stormcaster, yellow → Sunwarden). No selection control — the class is
  simply announced.

## 5. Update the display client

- `RingTable.tsx`: seats swap `shielded` for `shields` (render pips),
  seats tint by `deckId` (red `#ef4444`, green `#22c55e`, blue `#3b82f6`,
  yellow `#f59e0b`), and `lastPlayed` now carries `defId`, `effects` and
  `targetSeatId` — show the card by name/art and flash the victim's seat
  (border `#f87171` ~600ms, or overlay `target-marker-seat.svg`).

## 6. Theme

Apply after the game plays correctly. `files/assets/README.md` has sizes and
coordinates; `files/assets/phone-screens.html` holds the design tokens as CSS
custom properties — port them into `client/src/player/styles.ts`.

- Fonts: Cinzel (headings/numbers), EB Garamond (body), **bundled locally**
  via `@fontsource/*`. Nothing may load from an external URL — LAN-only demo.
- Board: `board-bg.svg` backdrop; panels per `player-panel-wide/tall.svg`
  (inline the SVGs — `currentColor` tinting doesn't work through `<img>`), or
  a CSS approximation if time is short. Lobby per `lobby-bg.svg`,
  `room-code-plate.svg`, slot designs, `host-crown.svg`.
- Phones: match `phone-screens.html` — all six screens including the busy
  join button, error line, and the reconnect veil (socket.io events + a
  client-side 60s countdown; no protocol change).

## 7. Card art

`files/assets/cards/` — 31 images named exactly `${defId}.jpg`, matching
`cards.ts` one-to-one now that named cards exist. Resolve by convention:

```ts
const art = new URL(`../assets/cards/${card.defId}.jpg`, import.meta.url).href
```

Art is 3:2 landscape in a portrait slot: `object-fit: cover`, accept the
crop, don't letterbox. Already downscaled (900px, 1.9 MB total) — don't
re-import originals.

## 8. Fix the docs

`docs/game-mechanics.md` describes the old rules end to end; rewrite it from
section 1. `.scratch/card-game/spec.md`'s wire-protocol block has the old
types verbatim; update to match the new `shared/src/index.ts`. Claude Code
sessions read both and will otherwise reimplement the old game.

## 9. Verify

- [ ] Full test suite green (server, client, shared) after the rewrite
- [ ] All four decks: `buildDeck(...).length === 15`
- [ ] Four players get four different decks; no deck is ever duplicated
- [ ] A player who leaves and a new one joins gets the freed deck
- [ ] Damage past a shield carries to HP; strip floors at 0; shields cap at 4
- [ ] Heal caps at 10; chain caps at 5
- [ ] Hand refills to 3; a draw card can exceed 3
- [ ] Hands never appear in `tableState`
- [ ] Single-opponent and `all` cards never show the target picker
- [ ] Every defId in `cards.ts` resolves to an image in `assets/cards/`
- [ ] Display flashes the attacked seat
- [ ] Reconnect: kill a phone's wifi mid-match → veil → reclaim within 60s
- [ ] Nothing loads from an external URL

## 10. Cut list, in order

1. Drop `draw` and `playAgain` cards from the decks (data edit — `resolve.ts`
   handles all kinds regardless). **Keep `strip`**: blue has three 3-shield
   cards and no healing; without strip it is nearly unkillable.
2. Everyone plays `RED_DECK` — symmetric, no balance risk, still new engine.
3. Auto-target lowest-HP opponent everywhere; delete the target picker.
4. Theme the display only; leave phones plain.
5. Skip card art (the themed frames carry it).
