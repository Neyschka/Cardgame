// The display client's ring table (spec.md's "Display client"; validated in
// issues/05-display-client-layout.md's Variant A and issues/08's win screen).
// Pure render of `PublicTableState` — no local game-state logic beyond the
// attack-flash timer below, so the wire broadcast is the only thing that can
// change what's on screen.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { PublicSeat, PublicTableState } from '@card-game/shared';
import { CLASS_COLORS } from '../deckTheme';
import { effectPills } from '../player/cards';

type Slot = 'N' | 'E' | 'S' | 'W';

// Seats sit at fixed cardinal positions — 2/3/4 are the only possible counts,
// since a match locks in with `gameState.ts`'s MIN_PLAYERS–SEAT_COUNT (2–4)
// named seats and a seat's name never clears once claimed.
const SLOTS_BY_COUNT: Record<number, Slot[]> = {
  2: ['N', 'S'],
  3: ['N', 'E', 'S'],
  4: ['N', 'E', 'S', 'W'],
};

const SLOT_STYLE: Record<Slot, CSSProperties> = {
  N: { top: 12, left: '50%', transform: 'translateX(-50%)' },
  S: { bottom: 12, left: '50%', transform: 'translateX(-50%)' },
  E: { right: 12, top: '50%', transform: 'translateY(-50%)' },
  W: { left: 12, top: '50%', transform: 'translateY(-50%)' },
};

/** Fixed by docs/game-mechanics.md — HP never exceeds this. */
const MAX_HP = 10;

/** How long a just-attacked seat's border flashes. */
const FLASH_MS = 600;

/** The seat a card's damage/strip just landed on, for `FLASH_MS` — cleared on
 *  unmount or the next `lastPlayed`, whichever comes first. `lastPlayed` is a
 *  fresh object on every broadcast, so this fires once per actual play, not
 *  once per re-render. */
function useAttackFlash(
  lastPlayed: PublicTableState['lastPlayed'],
): string | null {
  const [flashSeatId, setFlashSeatId] = useState<string | null>(null);

  useEffect(() => {
    if (!lastPlayed?.targetSeatId) return;
    setFlashSeatId(lastPlayed.targetSeatId);
    const timeout = setTimeout(() => setFlashSeatId(null), FLASH_MS);
    return () => clearTimeout(timeout);
  }, [lastPlayed]);

  return flashSeatId;
}

export function RingTable({ table }: { table: PublicTableState }) {
  const flashSeatId = useAttackFlash(table.lastPlayed);

  // Lobby shows every seat (open ones included) so newcomers see where to
  // join; once a match locks in its roster, an unclaimed seat never played
  // and isn't shown — the cardinal count reflects only who's actually seated.
  const seatsToShow =
    table.phase === 'lobby'
      ? table.seats
      : table.seats.filter((seat) => seat.name !== null);
  const slots = SLOTS_BY_COUNT[seatsToShow.length]!;
  const nameFor = (seatId: string) =>
    table.seats.find((seat) => seat.seatId === seatId)?.name ?? seatId;
  const winnerSeatId =
    table.matchResult && 'winnerSeatId' in table.matchResult
      ? table.matchResult.winnerSeatId
      : null;

  return (
    <div
      data-testid="ring-table"
      style={{
        fontFamily: 'sans-serif',
        color: '#eee',
        background: '#0b1220',
        minHeight: '100vh',
        padding: 24,
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Card Game</h1>
        {table.phase === 'lobby' && (
          <p style={{ fontSize: 20 }}>
            Room code{' '}
            <strong style={{ letterSpacing: 4 }}>{table.roomCode}</strong> —
            join at <code>{table.lanAddress}</code>
          </p>
        )}
      </header>

      <div
        style={{
          position: 'relative',
          width: 640,
          height: 560,
          margin: '0 auto',
        }}
      >
        <CenterRegion
          table={table}
          nameFor={nameFor}
          winnerSeatId={winnerSeatId}
        />

        {seatsToShow.map((seat, index) => {
          const slot = slots[index]!;
          const highlighted =
            table.phase === 'matchOver'
              ? seat.seatId === winnerSeatId
              : seat.seatId === table.turnSeatId;
          return (
            <SeatBox
              key={seat.seatId}
              seat={seat}
              slot={slot}
              highlighted={highlighted}
              flashed={seat.seatId === flashSeatId}
              showLiveDetails={table.phase !== 'lobby'}
            />
          );
        })}
      </div>
    </div>
  );
}

function CenterRegion({
  table,
  nameFor,
  winnerSeatId,
}: {
  table: PublicTableState;
  nameFor: (seatId: string) => string;
  winnerSeatId: string | null;
}) {
  if (table.phase === 'lobby') {
    const joined = table.seats.filter((seat) => seat.name !== null).length;
    return (
      <Circle>
        {joined}/{table.seats.length} joined
      </Circle>
    );
  }

  if (table.phase === 'matchOver') {
    const result = table.matchResult!;
    const isDraw = 'draw' in result;
    const chain = [
      ...table.eliminationOrder,
      ...(winnerSeatId ? [winnerSeatId] : []),
    ].map(nameFor);

    return (
      <div
        data-testid="match-over-card"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 300,
          padding: 24,
          borderRadius: 16,
          background: '#16213a',
          border: '2px solid #ffd166',
          textAlign: 'center',
          boxShadow: '0 0 30px rgba(255,209,102,0.35)',
        }}
      >
        <div style={{ fontSize: 40 }}>{isDraw ? '🤝' : '🏆'}</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
          {isDraw ? 'Draw!' : `${nameFor(result.winnerSeatId)} wins!`}
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: '#8fa3c9' }}>
          {chain.map((name, index) => (
            <span key={index}>
              {index > 0 && ' → '}
              {!isDraw && index === chain.length - 1 ? (
                <strong style={{ color: '#ffd166' }}>{name}</strong>
              ) : (
                name
              )}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: '#5a6b8c' }}>
          Waiting for the host to start a new match…
        </div>
      </div>
    );
  }

  // inMatch
  if (!table.lastPlayed) return <Circle>no card played yet</Circle>;
  const { name, effects, bySeatId } = table.lastPlayed;
  return (
    <Circle>
      <div
        style={{
          width: 130,
          minHeight: 160,
          background: '#fdfdfb',
          color: '#1a1a1a',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontWeight: 700, textAlign: 'center' }}>{name}</div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            justifyContent: 'center',
            marginTop: 8,
          }}
        >
          {effectPills({ effects }).map((pill, index) => (
            <span
              key={index}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 999,
                background: pill.color,
                color: '#1a1a1a',
                whiteSpace: 'nowrap',
              }}
            >
              {pill.icon} {pill.label}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, marginTop: 8, color: '#555' }}>
          played by {nameFor(bySeatId)}
        </div>
      </div>
    </Circle>
  );
}

function Circle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 260,
        height: 260,
        borderRadius: '50%',
        background: '#16213a',
        border: '2px solid #2c3e63',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontSize: 14,
        color: '#8fa3c9',
      }}
    >
      {children}
    </div>
  );
}

function CardBack() {
  return (
    <div
      style={{
        width: 20,
        height: 28,
        borderRadius: 3,
        background:
          'repeating-linear-gradient(45deg, #3a4a7a, #3a4a7a 3px, #2c3968 3px, #2c3968 6px)',
        border: '1px solid #1a2340',
        marginLeft: -8,
      }}
    />
  );
}

function SeatBox({
  seat,
  slot,
  highlighted,
  flashed,
  showLiveDetails,
}: {
  seat: PublicSeat;
  slot: Slot;
  highlighted: boolean;
  flashed: boolean;
  showLiveDetails: boolean;
}) {
  const showDetails = seat.name !== null && showLiveDetails && !seat.eliminated;
  const classColor = seat.deckId ? CLASS_COLORS[seat.deckId] : undefined;

  return (
    <div
      data-testid={`seat-${seat.seatId}`}
      style={{ position: 'absolute', ...SLOT_STYLE[slot] }}
    >
      <div
        style={{
          width: 190,
          padding: 12,
          borderRadius: 10,
          background: seat.eliminated ? '#1a1f2b' : '#1c2942',
          borderTop: `1px solid ${flashed ? '#f87171' : '#33456e'}`,
          borderRight: `1px solid ${flashed ? '#f87171' : '#33456e'}`,
          borderBottom: `1px solid ${flashed ? '#f87171' : '#33456e'}`,
          borderLeft: `4px solid ${flashed ? '#f87171' : (classColor ?? '#33456e')}`,
          outline: highlighted ? '2px solid #ffd166' : 'none',
          opacity: seat.eliminated ? 0.5 : 1,
          boxShadow: highlighted
            ? '0 0 16px rgba(255,209,102,0.5)'
            : flashed
              ? '0 0 16px rgba(248,113,113,0.6)'
              : 'none',
          transition: 'box-shadow 150ms, border-color 150ms',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
          }}
        >
          <strong>
            <span>
              {seat.name ?? <em style={{ color: '#5a6b8c' }}>open seat</em>}
            </span>
            {seat.isHost && seat.name && <span> 👑</span>}
          </strong>
          {seat.eliminated && <span style={{ color: '#ff6b6b' }}>OUT</span>}
        </div>
        {showDetails && (
          <>
            <div
              style={{
                background: '#0b1220',
                borderRadius: 4,
                height: 8,
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${(seat.hp / MAX_HP) * 100}%`,
                  background: seat.hp > 3 ? '#4caf50' : '#e63946',
                  height: '100%',
                  borderRadius: 4,
                }}
              />
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#8fa3c9' }}>
              {seat.hp} HP{seat.shields > 0 && ` · ${seat.shields}🛡️`}
            </div>
          </>
        )}
      </div>
      {showDetails && (
        <div
          data-testid={`hand-fan-${seat.seatId}`}
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: 8,
            paddingLeft: 8,
          }}
        >
          {Array.from({ length: seat.handCount }).map((_, cardIndex) => (
            <CardBack key={cardIndex} />
          ))}
        </div>
      )}
    </div>
  );
}
