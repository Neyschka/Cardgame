// Test-only seams for driving a `Table` deterministically, shared by
// `gameState.test.ts` (the state machine) and `index.test.ts` (the wiring).
// Not a suite itself — vitest only collects `*.test.ts`.

/** A constant RNG would mint every seat the same token, so tests need a real
 *  (if tiny) sequence — while staying reproducible run to run. */
export function seededRandom(seed = 1) {
  let value = seed
  return () => {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648
    return value / 2_147_483_648
  }
}

/** Deck seam: front-loads the named card definition ids, so a seat's opening
 *  hand is known up front. Each of the four class decks holds different card
 *  ids, so a fixture written against one class's names is a no-op — not an
 *  error — against the other three; only the deck actually being controlled
 *  needs every name to match. The rest of the 15-card deck stays in its
 *  original (unshuffled) order behind the front-loaded cards. */
export const deckOrderedBy = (defIds: string[]) => (cards: string[]) => {
  const rest = [...cards]
  const front: string[] = []
  for (const defId of defIds) {
    const index = rest.indexOf(defId)
    if (index === -1) continue
    front.push(...rest.splice(index, 1))
  }
  return [...front, ...rest]
}

/** Red deck (Pyromancer), the class the first joiner always gets under a
 *  `random: () => 0` table (see `gameState.test.ts`'s `setup`). One shield,
 *  one combo (damage + self-heal), one plain attack — enough variety for a
 *  3-card opening hand to exercise more than one effect kind. */
export const RED_OPENER = ['cinder_ward', 'searing_mend', 'ember_bolt']

/** Both of red's `playAgain` copies front-loaded, for chain tests: kindle,
 *  kindle, then a plain attack that ends the chain. */
export const RED_CHAIN_OPENER = ['kindle', 'kindle', 'flame_lash']
