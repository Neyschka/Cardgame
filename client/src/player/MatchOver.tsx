// The result itself lives on the shared display; this client only says the
// match is done, and gives the host the rematch control (spec.md's "Match
// over" — the display is view-only, so New match lives here).

import {
  centered,
  colors,
  disabledButton,
  errorText,
  primaryButton,
  title,
} from './styles'
import { claimedSeats, MIN_PLAYERS } from './tableRules'
import type { PublicSeat } from '@card-game/shared'

export interface MatchOverProps {
  seats: PublicSeat[]
  isHost: boolean
  error: string | null
  onNewMatch: () => void
}

export function MatchOver({
  seats,
  isHost,
  error,
  onNewMatch,
}: MatchOverProps) {
  const canStart = claimedSeats(seats).length >= MIN_PLAYERS

  return (
    <div style={centered}>
      <div style={{ fontSize: 48 }}>🏁</div>
      <h2 style={{ ...title, margin: 0, fontSize: 26 }}>Match over</h2>
      <p style={{ color: colors.mutedText, margin: 0 }}>
        Check the shared screen for the result.
      </p>
      {isHost && (
        <button
          onClick={onNewMatch}
          disabled={!canStart}
          style={{
            ...(canStart ? primaryButton : disabledButton),
            marginTop: 16,
          }}
        >
          {canStart ? 'New match' : 'Need at least 2 players'}
        </button>
      )}
      {error && <p style={errorText}>{error}</p>}
    </div>
  )
}
