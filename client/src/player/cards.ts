// How a hand card reads on screen. The server sends `legal` as a bare boolean
// (`HandCard`), so the one-line reason a dead card shows in the grid is
// re-derived from its type here — the only client-side rule knowledge in the
// player client, and it mirrors `server/src/gameState.ts`'s `illegalReason`
// rather than deciding anything itself.

import type { CardType, HandCard } from '@card-game/shared'

const TYPE_ICON: Record<CardType, string> = {
  Attack: '⚔️',
  Defense: '🛡️',
  Heal: '➕',
}

export const typeIcon = (type: CardType): string => TYPE_ICON[type]

export const cardLabel = (card: HandCard): string =>
  card.value == null ? card.type : `${card.type} ${card.value}`

/** The three conditions in `docs/game-mechanics.md`'s "Legal play conditions",
 *  worded exactly as `server/src/gameState.ts`'s `illegalReason` words them. */
export function illegalReason(card: HandCard): string | null {
  if (card.legal) return null
  if (card.type === 'Defense') return 'already shielded'
  if (card.type === 'Heal') return 'already at full HP'
  return 'no living opponents'
}
