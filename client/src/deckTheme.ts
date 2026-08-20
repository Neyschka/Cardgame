// The four class decks' display identity — shared between the player
// client's lobby roster (`player/Lobby.tsx`) and the display's seat tinting
// (`display/RingTable.tsx`), so the two clients can't drift on what a
// `deckId` reads as. `server/src/cards.ts`'s `DECKS` is the deck content
// itself; this is presentation only.

import type { DeckId } from '@card-game/shared'

export const CLASS_NAMES: Record<DeckId, string> = {
  red: 'Pyromancer',
  green: 'Sylvan Ranger',
  blue: 'Stormcaster',
  yellow: 'Sunwarden',
}

export const CLASS_COLORS: Record<DeckId, string> = {
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#f59e0b',
}
