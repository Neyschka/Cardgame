// Roster plus the host's Start control. Start lives here rather than on the
// display because the display accepts no input (spec.md's "Display client").
// Layout follows phone-screens.html's "2 · Waiting room" — every seat shown,
// empty ones included, so a joiner sees how much room is left.

import type { PublicSeat } from '@card-game/shared'
import { CLASS_COLORS, CLASS_NAMES } from '../deckTheme'
import {
  disabledButton,
  errorText,
  gutter,
  primaryButton,
  rule,
  screen,
  subtitle,
  title,
  tokens,
} from './styles'
import { claimedSeats, MAX_SEATS, MIN_PLAYERS } from './tableRules'

export interface LobbyProps {
  roomCode: string
  seats: PublicSeat[]
  isHost: boolean
  error: string | null
  onStart: () => void
}

export function Lobby({ roomCode, seats, isHost, error, onStart }: LobbyProps) {
  const claimed = claimedSeats(seats)
  const canStart = claimed.length >= MIN_PLAYERS

  return (
    <div style={screen}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: gutter,
          paddingBottom: `calc(${gutter} + env(safe-area-inset-bottom))`,
        }}
      >
        <h1 style={{ ...title, fontSize: 'clamp(20px, 6vw, 25px)' }}>
          Gather Your Party
        </h1>
        <p style={subtitle}>
          Room <strong style={{ color: tokens.goldLt }}>{roomCode}</strong> ·{' '}
          {claimed.length} of {MAX_SEATS} seated
        </p>
        <hr style={rule} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {seats.map((seat) =>
            seat.name !== null ? (
              <SeatRow key={seat.seatId} seat={seat} />
            ) : (
              <EmptySlot key={seat.seatId} />
            ),
          )}
        </div>
        <div style={{ flex: 1 }} />
        {isHost ? (
          <>
            <button
              onClick={onStart}
              disabled={!canStart}
              style={canStart ? primaryButton : disabledButton}
            >
              {canStart ? 'Begin Battle' : 'Need at least 2 players'}
            </button>
            {canStart && (
              <p style={{ ...subtitle, marginTop: 12, marginBottom: 0 }}>
                You are the host — start when ready
              </p>
            )}
          </>
        ) : (
          <p style={{ ...subtitle, marginTop: 0, marginBottom: 0 }}>
            Waiting for the host to start…
          </p>
        )}
        {error && <p style={{ ...errorText, marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  )
}

function SeatRow({ seat }: { seat: PublicSeat }) {
  const color = seat.deckId ? CLASS_COLORS[seat.deckId] : tokens.gold
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 14,
        background: tokens.panel,
        border: `2.5px solid ${color}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: color,
          opacity: 0.18,
        }}
      />
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: tokens.inset,
          border: `2px solid ${tokens.goldDk}`,
          flexShrink: 0,
          zIndex: 1,
        }}
      />
      <div style={{ textAlign: 'left', zIndex: 1 }}>
        <strong
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 20,
            fontWeight: 600,
            display: 'block',
          }}
        >
          {seat.name}
        </strong>
        {seat.deckId && (
          <span style={{ fontSize: 15, color: tokens.gold }}>
            {CLASS_NAMES[seat.deckId]}
          </span>
        )}
      </div>
      {seat.isHost && (
        <span style={{ marginLeft: 'auto', fontSize: 22, zIndex: 1 }}>👑</span>
      )}
    </div>
  )
}

function EmptySlot() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 14,
        background: 'rgba(21,12,40,0.6)',
        border: `2.5px dashed rgba(201,162,39,0.4)`,
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: tokens.inset,
          border: `2px solid ${tokens.goldDk}`,
          opacity: 0.4,
          flexShrink: 0,
        }}
      />
      <span style={{ color: tokens.muted, fontSize: 17 }}>
        Awaiting a champion…
      </span>
    </div>
  )
}
