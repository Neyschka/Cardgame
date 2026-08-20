// Roster plus the host's Start control. Start lives here rather than on the
// display because the display accepts no input (spec.md's "Display client").

import type { PublicSeat } from '@card-game/shared';
import { CLASS_COLORS, CLASS_NAMES } from '../deckTheme';
import {
  colors,
  disabledButton,
  errorText,
  gutter,
  primaryButton,
  screen,
} from './styles';
import { claimedSeats, MAX_SEATS, MIN_PLAYERS } from './tableRules';

export interface LobbyProps {
  seats: PublicSeat[];
  isHost: boolean;
  error: string | null;
  onStart: () => void;
}

export function Lobby({ seats, isHost, error, onStart }: LobbyProps) {
  const claimed = claimedSeats(seats);
  const canStart = claimed.length >= MIN_PLAYERS;

  return (
    <div style={screen}>
      <div
        style={{
          padding: gutter,
          paddingBottom: `calc(${gutter} + env(safe-area-inset-bottom))`,
        }}
      >
        <h2 style={{ textAlign: 'center' }}>
          Lobby ({claimed.length}/{MAX_SEATS})
        </h2>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 16,
          }}
        >
          {claimed.map((seat) => (
            <div
              key={seat.seatId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                background: colors.panel,
                borderRadius: 8,
                borderLeft: `4px solid ${seat.deckId ? CLASS_COLORS[seat.deckId] : colors.border}`,
              }}
            >
              <span>{seat.name}</span>
              {seat.isHost && <span> 👑</span>}
              {seat.deckId && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 12,
                    fontWeight: 700,
                    color: CLASS_COLORS[seat.deckId],
                  }}
                >
                  {CLASS_NAMES[seat.deckId]}
                </span>
              )}
            </div>
          ))}
        </div>
        {isHost ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            style={{
              ...(canStart ? primaryButton : disabledButton),
              marginTop: 24,
            }}
          >
            {canStart ? 'Start match' : 'Need at least 2 players'}
          </button>
        ) : (
          <p
            style={{
              textAlign: 'center',
              marginTop: 24,
              color: colors.mutedText,
            }}
          >
            Waiting for the host to start…
          </p>
        )}
        {error && <p style={{ ...errorText, marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
