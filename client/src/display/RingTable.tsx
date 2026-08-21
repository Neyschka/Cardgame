// The display client's ring table (spec.md's "Display client"; validated in
// issues/05-display-client-layout.md's Variant A and issues/08's win screen).
// Pure render of `PublicTableState` — no local game-state logic beyond the
// attack-flash timer below, so the wire broadcast is the only thing that can
// change what's on screen.
//
// Palette/type match `player/styles.ts`'s tokens (ported from
// `game-update/files/assets/phone-screens.html`); the backdrop is a direct
// port of `game-update/files/assets/board-bg.svg` — small and purely
// decorative, so reimplementing it as JSX is simpler than fetching and
// tinting the asset file at runtime.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { PublicSeat, PublicTableState } from '@card-game/shared'
import { cardArtUrl } from '../assets/cardArt'
import { CLASS_COLORS } from '../deckTheme'
import { effectPills } from '../player/cards'
import { tokens } from '../player/styles'

type Slot = 'N' | 'E' | 'S' | 'W'

// Seats sit at fixed cardinal positions — 2/3/4 are the only possible counts,
// since a match locks in with `gameState.ts`'s MIN_PLAYERS–SEAT_COUNT (2–4)
// named seats and a seat's name never clears once claimed.
const SLOTS_BY_COUNT: Record<number, Slot[]> = {
  2: ['N', 'S'],
  3: ['N', 'E', 'S'],
  4: ['N', 'E', 'S', 'W'],
}

const SLOT_STYLE: Record<Slot, CSSProperties> = {
  N: { top: 12, left: '50%', transform: 'translateX(-50%)' },
  S: { bottom: 12, left: '50%', transform: 'translateX(-50%)' },
  E: { right: 12, top: '50%', transform: 'translateY(-50%)' },
  W: { left: 12, top: '50%', transform: 'translateY(-50%)' },
}

/** Fixed by docs/game-mechanics.md — HP never exceeds this. */
const MAX_HP = 10

/** How long a just-attacked seat's border flashes. */
const FLASH_MS = 600

/** The seat a card's damage/strip just landed on, for `FLASH_MS` — cleared on
 *  unmount or the next `lastPlayed`, whichever comes first. `lastPlayed` is a
 *  fresh object on every broadcast, so this fires once per actual play, not
 *  once per re-render. */
function useAttackFlash(
  lastPlayed: PublicTableState['lastPlayed'],
): string | null {
  const [flashSeatId, setFlashSeatId] = useState<string | null>(null)

  useEffect(() => {
    if (!lastPlayed?.targetSeatId) return
    setFlashSeatId(lastPlayed.targetSeatId)
    const timeout = setTimeout(() => setFlashSeatId(null), FLASH_MS)
    return () => clearTimeout(timeout)
  }, [lastPlayed])

  return flashSeatId
}

export function RingTable({ table }: { table: PublicTableState }) {
  const flashSeatId = useAttackFlash(table.lastPlayed)

  // Lobby shows every seat (open ones included) so newcomers see where to
  // join; once a match locks in its roster, an unclaimed seat never played
  // and isn't shown — the cardinal count reflects only who's actually seated.
  const seatsToShow =
    table.phase === 'lobby'
      ? table.seats
      : table.seats.filter((seat) => seat.name !== null)
  const slots = SLOTS_BY_COUNT[seatsToShow.length]!
  const nameFor = (seatId: string) =>
    table.seats.find((seat) => seat.seatId === seatId)?.name ?? seatId
  const winnerSeatId =
    table.matchResult && 'winnerSeatId' in table.matchResult
      ? table.matchResult.winnerSeatId
      : null

  return (
    <div
      data-testid="ring-table"
      style={{
        position: 'relative',
        fontFamily: tokens.fontBody,
        color: tokens.parchment,
        background: tokens.void,
        minHeight: '100vh',
        padding: 24,
        overflow: 'hidden',
      }}
    >
      <BoardBackdrop />

      <header
        style={{ position: 'relative', textAlign: 'center', marginBottom: 24 }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: tokens.fontDisplay,
            fontSize: 40,
            fontWeight: 700,
            color: tokens.parchment,
          }}
        >
          Card Game
        </h1>
        {table.phase === 'lobby' && (
          <p
            style={{
              fontSize: 20,
              color: tokens.muted,
              fontFamily: tokens.fontBody,
            }}
          >
            Room code{' '}
            <strong style={{ letterSpacing: 4, color: tokens.goldLt }}>
              {table.roomCode}
            </strong>{' '}
            — join at{' '}
            <code style={{ color: tokens.parchment }}>{table.lanAddress}</code>
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
          const slot = slots[index]!
          const highlighted =
            table.phase === 'matchOver'
              ? seat.seatId === winnerSeatId
              : seat.seatId === table.turnSeatId
          return (
            <SeatBox
              key={seat.seatId}
              seat={seat}
              slot={slot}
              highlighted={highlighted}
              flashed={seat.seatId === flashSeatId}
              showLiveDetails={table.phase !== 'lobby'}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Ported from `board-bg.svg` — violet radial table, gold trim, corner
 *  flourishes, a centre play-area frame. Fixed behind everything else. */
function BoardBackdrop() {
  return (
    <svg
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    >
      <defs>
        <radialGradient id="rt-table" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor={tokens.table1} />
          <stop offset="55%" stopColor={tokens.table2} />
          <stop offset="100%" stopColor={tokens.table3} />
        </radialGradient>
        <radialGradient id="rt-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={tokens.gold} stopOpacity={0.22} />
          <stop offset="100%" stopColor={tokens.gold} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="rt-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tokens.goldLt} />
          <stop offset="50%" stopColor={tokens.gold} />
          <stop offset="100%" stopColor={tokens.goldDk} />
        </linearGradient>
      </defs>

      <rect width={1920} height={1080} fill={tokens.void} />
      <rect
        x={24}
        y={24}
        width={1872}
        height={1032}
        rx={32}
        fill="url(#rt-table)"
      />
      <ellipse cx={960} cy={540} rx={620} ry={420} fill="url(#rt-glow)" />

      <rect
        x={24}
        y={24}
        width={1872}
        height={1032}
        rx={32}
        fill="none"
        stroke="url(#rt-gold)"
        strokeWidth={3}
        opacity={0.85}
      />
      <rect
        x={44}
        y={44}
        width={1832}
        height={992}
        rx={24}
        fill="none"
        stroke={tokens.gold}
        strokeWidth={1}
        opacity={0.3}
      />

      <g opacity={0.9}>
        <rect
          x={600}
          y={330}
          width={720}
          height={420}
          rx={20}
          fill="#2a1a44"
          fillOpacity={0.75}
        />
        <rect
          x={600}
          y={330}
          width={720}
          height={420}
          rx={20}
          fill="none"
          stroke="url(#rt-gold)"
          strokeWidth={2.5}
        />
      </g>

      <g stroke="url(#rt-gold)" strokeWidth={2} fill="none" opacity={0.7}>
        <path d="M92 92h72M92 92v72M92 92l26 26" />
        <path d="M1828 92h-72M1828 92v72M1828 92l-26 26" />
        <path d="M92 988h72M92 988v-72M92 988l26-26" />
        <path d="M1828 988h-72M1828 988v-72M1828 988l-26-26" />
      </g>
    </svg>
  )
}

function CenterRegion({
  table,
  nameFor,
  winnerSeatId,
}: {
  table: PublicTableState
  nameFor: (seatId: string) => string
  winnerSeatId: string | null
}) {
  if (table.phase === 'lobby') {
    const joined = table.seats.filter((seat) => seat.name !== null).length
    return (
      <Circle>
        {joined}/{table.seats.length} joined
      </Circle>
    )
  }

  if (table.phase === 'matchOver') {
    const result = table.matchResult!
    const isDraw = 'draw' in result
    const chain = [
      ...table.eliminationOrder,
      ...(winnerSeatId ? [winnerSeatId] : []),
    ].map(nameFor)

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
          background: tokens.panel,
          border: `2px solid ${tokens.goldLt}`,
          textAlign: 'center',
          boxShadow: '0 0 30px rgba(240,217,138,0.35)',
        }}
      >
        <div style={{ fontSize: 40 }}>{isDraw ? '🤝' : '🏆'}</div>
        <div
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 24,
            fontWeight: 700,
            marginTop: 4,
          }}
        >
          {isDraw ? 'Draw!' : `${nameFor(result.winnerSeatId)} wins!`}
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: tokens.muted }}>
          {chain.map((name, index) => (
            <span key={index}>
              {index > 0 && ' → '}
              {!isDraw && index === chain.length - 1 ? (
                <strong style={{ color: tokens.goldLt }}>{name}</strong>
              ) : (
                name
              )}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: tokens.muted }}>
          Waiting for the host to start a new match…
        </div>
      </div>
    )
  }

  // inMatch
  if (!table.lastPlayed) return <Circle>no card played yet</Circle>
  const { defId, name, effects, bySeatId } = table.lastPlayed
  return (
    <Circle>
      <div
        style={{
          width: 140,
          minHeight: 175,
          background: '#fdfdfb',
          color: '#1a1a1a',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 10,
          boxSizing: 'border-box',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}
      >
        <img
          src={cardArtUrl(defId)}
          alt=""
          style={{
            width: '100%',
            height: 70,
            objectFit: 'cover',
            borderRadius: 6,
          }}
        />
        <div
          style={{
            fontFamily: tokens.fontDisplay,
            fontWeight: 700,
            textAlign: 'center',
            marginTop: 8,
          }}
        >
          {name}
        </div>
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
                fontFamily: tokens.fontDisplay,
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
  )
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
        background: tokens.panel,
        border: `2px solid ${tokens.goldDk}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontFamily: tokens.fontDisplay,
        fontSize: 14,
        color: tokens.muted,
      }}
    >
      {children}
    </div>
  )
}

function CardBack() {
  return (
    <div
      style={{
        width: 20,
        height: 28,
        borderRadius: 3,
        background: `repeating-linear-gradient(45deg, ${tokens.goldDk}, ${tokens.goldDk} 3px, ${tokens.inset} 3px, ${tokens.inset} 6px)`,
        border: `1px solid ${tokens.gold}`,
        marginLeft: -8,
      }}
    />
  )
}

function SeatBox({
  seat,
  slot,
  highlighted,
  flashed,
  showLiveDetails,
}: {
  seat: PublicSeat
  slot: Slot
  highlighted: boolean
  flashed: boolean
  showLiveDetails: boolean
}) {
  const showDetails = seat.name !== null && showLiveDetails && !seat.eliminated
  const classColor = seat.deckId ? CLASS_COLORS[seat.deckId] : tokens.goldDk
  // A lighter red than tokens.red/CLASS_COLORS.red (#ef4444) on purpose — a
  // red-deck seat's own border is already that color, so the flash needs its
  // own shade to still read as "just hit" rather than disappearing into it.
  const FLASH_COLOR = '#f87171'
  const borderColor = flashed ? FLASH_COLOR : classColor

  return (
    <div
      data-testid={`seat-${seat.seatId}`}
      style={{ position: 'absolute', ...SLOT_STYLE[slot] }}
    >
      <div
        style={{
          width: 200,
          padding: 12,
          borderRadius: 12,
          background: seat.eliminated ? tokens.inset : tokens.panel,
          borderTop: `2px solid ${borderColor}`,
          borderRight: `2px solid ${borderColor}`,
          borderBottom: `2px solid ${borderColor}`,
          borderLeft: `5px solid ${borderColor}`,
          outline: highlighted ? `2px solid ${tokens.goldLt}` : 'none',
          opacity: seat.eliminated ? 0.5 : 1,
          boxShadow: highlighted
            ? '0 0 16px rgba(240,217,138,0.5)'
            : flashed
              ? '0 0 16px rgba(248,113,113,0.6)'
              : 'none',
          transition: 'box-shadow 150ms, border-color 150ms',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 14,
          }}
        >
          <strong style={{ fontFamily: tokens.fontDisplay }}>
            <span>
              {seat.name ?? <em style={{ color: tokens.muted }}>open seat</em>}
            </span>
            {seat.isHost && seat.name && <span> 👑</span>}
          </strong>
          {seat.eliminated && <span style={{ color: tokens.red }}>OUT</span>}
        </div>
        {showDetails && (
          <>
            <div
              style={{
                background: tokens.inset,
                borderRadius: 4,
                height: 8,
                marginTop: 6,
                border: `1px solid ${tokens.goldDk}`,
              }}
            >
              <div
                style={{
                  width: `${(seat.hp / MAX_HP) * 100}%`,
                  background: tokens.red,
                  height: '100%',
                  borderRadius: 3,
                }}
              />
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: tokens.muted }}>
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
  )
}
