# Game Mechanics

A turn-based, free-for-all card game inspired by Dungeon Mayhem.

## Match setup

- 2–4 players, free-for-all (no teams).
- Every player uses an **identical, symmetric deck** — no character asymmetry in this version (see Future extensions).
- Turn order is **randomized once** at the start of the match, then fixed clockwise rotation for the rest of the game.
- Each player starts at **10 HP**.
- Each player shuffles their own 15-card deck and draws a starting hand of **5 cards**. The rest forms their personal draw pile.

## Turn structure

Turns are strictly sequential (not real-time/simultaneous). On a player's turn:

1. Play cards **one at a time, in any order**, for as long as you have at least one *legal* card to play ("play-until-can't"). There is no cap on how many cards you can play in a turn beyond running out of legal plays.
2. When no legal plays remain (or you choose to stop, if you still hold playable cards — see note), your turn ends.
3. **Draw back up to 5 cards** from your deck, refilling only the cards you actually played/discarded this turn. Cards left unplayed in hand are *not* replaced.
4. Turn passes to the next living player in rotation. Eliminated players' slots are skipped permanently.

### Legal play conditions

- **Attack**: always legal if at least one opponent is alive (true any time the game hasn't ended).
- **Heal**: illegal if you are already at max HP (10) — no overheal.
- **Defense**: illegal if you are already shielded (shields don't stack).

### Dead cards

A card that's currently illegal to play (e.g. a Heal while at full HP) simply **stays in hand**. It is not discarded or replaced — it waits until it becomes legal on a future turn.

## Card types

Every deck is 15 cards: **8 Attack / 4 Defense / 3 Heal**.

### Attack

- Played on your turn; you **choose any living opponent** to target (free targeting — no fixed or random target).
- Deals damage in varied amounts across the 8 cards, weighted low: **3× deal 1, 3× deal 2, 2× deal 3**.
- Reduces the target's HP; 0 or below eliminates them.

### Defense (Block)

- Played on your own turn (not reactively — there is no interrupt/response window in this turn-based design).
- Grants a **shield**: the next Attack that would hit you is fully negated (flat negate, regardless of the attack's damage value), and the shield is consumed.
- Shields **do not stack** — you can't play a second Defense while already shielded.
- An unused shield **expires** at the start of your next turn (use it or lose it).

### Heal

- Played on your own turn; restores **+2 HP** to yourself.
- Cannot exceed the 10 HP cap (no overheal) — illegal to play while at full HP.

## Combat resolution

- Attacks resolve immediately against the chosen target: if the target is shielded, the shield absorbs it and is consumed; otherwise HP is reduced by the card's value.
- A player reaching **0 HP is eliminated**: their deck, hand, and discard are removed from play, and they're skipped in future turn rotation.
- The game continues among remaining players.

## Decks and drawing

- Each player has their **own personal deck and discard pile** — no shared/communal deck.
- When a player's draw pile is empty and they need to draw, **shuffle their own discard pile** into a new draw pile.

## Win condition

- **Last player standing wins.**
- Edge case: if an effect were ever to eliminate the last two remaining players in the same resolution (simultaneous 0 HP), the match is a **shared draw** rather than resolved by tiebreak. Expected to be rare, since a single Attack card only ever hits one target.

## Match structure

- One game **is** the match — no best-of-N series. A series/lobby layer can be added later without changing these mechanics.

## Future extensions (explicitly out of scope for v1)

- **Character decks**: distinct decks per character with different value curves (e.g. an aggressive deck weighted toward 3-damage Attacks with fewer Heals, vs a tanky deck weighted toward Defense/Heal). Deferred because it requires a real balance pass across every character pairing.
- **Special/Action cards**: utility effects (extra draw, forced discard, turn-skip, redirect, steal) were considered and explicitly cut from v1 to keep the card pool to three legible categories.
- **Real-time/simultaneous play**: the original Dungeon Mayhem plays in real time with no turns. This design deliberately chose strict turn-based play instead.
