# Game Mechanics

A turn-based, free-for-all card game inspired by Dungeon Mayhem. Vocabulary
(Match, Table, Seat, Host, Room code, Display client, Player client) follows
`CONTEXT.md`.

## Match setup

- 2–4 players, free-for-all (no teams).
- Each seat is dealt one of **four asymmetric 15-card class decks** — red,
  green, blue, yellow — assigned at random **when the seat is claimed**, not
  at match start. There is no deck-select UI: a joining player is simply told
  which class they've been given (see "Classes" below). A seat's deck stays
  with it across a rematch; a freshly (re)claimed seat draws from whichever
  decks aren't currently held.
- Turn order is **randomized once** at the start of the match, then fixed
  clockwise rotation for the rest of the game.
- Each player starts at **10 HP**.
- Each player shuffles their own class deck and draws a starting hand of
  **3 cards**. The rest forms their personal draw pile.

## Turn structure

Turns are strictly sequential (not real-time/simultaneous). On a player's
turn:

1. Play **exactly one card**. There is no passing, and no play-until-can't —
   every card is always legal to play (see "No dead cards" below), so the
   turn is just "play a card."
2. If that card has `playAgain: true`, the same player **immediately plays
   again** — another single card, same rules, no draw in between. A chain can
   run as long as the player keeps playing `playAgain` cards; nothing caps
   how many times it can chain (a future draw+`playAgain` card should be free
   to run as long as the deck allows).
3. Once a played card **doesn't** have `playAgain`, the turn ends: the player
   **draws back up to 3 cards**, refilling only what they actually played
   this turn (unplayed cards stay in hand — hand size can exceed 3 mid-chain
   if a `draw` effect fired, but never mid-turn refill beyond that).
4. Turn passes to the next living player in rotation. Eliminated players'
   seats are skipped permanently; a disconnected seat is skipped instantly
   (an "auto-pass" turn, draw step included) until it reconnects or times out.

### No dead cards

Every card is unconditionally legal to play on your turn — there is no
legality gate. A heal at full HP simply clamps at 10 instead of being
rejected; a shield card just adds points (up to the cap) instead of requiring
you to be unshielded first. Nothing in a hand is ever "dead."

## Cards

Every deck is 15 cards. Unlike a simple type+value card, **a card carries a
list of effects** — most cards do one thing, some combine two (e.g. Shatter:
strip 1 shield, then 2 damage). Effect kinds:

- **attack** — deals damage to a target.
- **shield** — grants the *actor* shield points (see "Shields" below).
- **heal** — restores the actor's HP, capped at 10 (no overheal).
- **draw** — draws the actor extra cards, on top of the normal end-of-turn
  refill; can push a hand above 3.
- **strip** — destroys the target's shield points, floored at 0 (can't go
  negative).

Some cards also carry `playAgain: true` (see "Turn structure" above) — a
card-level flag that affects turn flow, not an effect in its own right.

### Targeting

Each `attack`/`strip` effect has a target mode:

- **single** — the player chooses any one living opponent. If exactly one
  opponent is alive, the client skips asking and the server auto-targets
  them.
- **all** — hits every living opponent at once; there's nothing to choose.

`shield`, `heal`, and `draw` effects always resolve on the player who played
the card, regardless of what target mode they're marked with.

## Shields

- Shields are **numeric points, 0 to 4** (not a boolean). A `shield` effect
  adds points up to that cap; extra points beyond the cap are wasted.
- Each shield point absorbs exactly 1 damage from an incoming attack; damage
  beyond the available shield points carries through to HP.
- Shields **persist** — they do not expire at the start of your next turn.
  The only way to lose shield points is spending them against an attack, or a
  `strip` effect destroying them directly.

## Combat resolution

- An `attack` effect resolves immediately: shield points absorb what they
  can, any remainder reduces the target's HP.
- A player reaching **0 HP is eliminated**: their deck, hand and discard are
  removed from play, and they're skipped in future turn rotation.
- The game continues among remaining players.

## Decks and drawing

- Each player has their **own personal deck and discard pile** — no
  shared/communal deck.
- When a player's draw pile is empty and they need to draw, **shuffle their
  own discard pile** into a new draw pile.

## Win condition

- **Last player standing wins.**
- Edge case: if an effect were ever to eliminate the last two remaining
  players in the same resolution (possible now via an `all`-target attack),
  the match is a **shared draw** rather than resolved by tiebreak.

## Match structure

- One game **is** the match — no best-of-N series. A series/lobby layer can
  be added later without changing these mechanics.

## Classes

Every player is dealt one of these four decks at random on join — nobody
picks. Card names and exact effects live in `server/src/cards.ts`; this is
just each deck's identity.

- **Pyromancer** (red) — burst damage, sweeps, shield-breaking, chains off
  `playAgain` cards. Highest ceiling, worst defence: kills first or dies
  first.
- **Sylvan Ranger** (green) — consistent damage and card advantage, no dead
  draws. Never has a bad turn, never has a spectacular one.
- **Stormcaster** (blue) — heavy shields, chip damage, chains off `playAgain`
  cards. Lowest damage in the game, hardest to remove.
- **Sunwarden** (yellow) — sustain, shield-stripping, small steady damage.
  Grinds; wins by outlasting the aggressive decks.

## Future extensions (explicitly out of scope for v1)

- **Real-time/simultaneous play**: the original Dungeon Mayhem plays in real
  time with no turns. This design deliberately keeps strict turn-based play
  instead.
