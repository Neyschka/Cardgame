// The player client's one stateful piece: it holds the socket subscriptions and
// the seat this device owns, and picks a screen from the phase the server
// broadcasts. Every rule decision belongs to the server — nothing here predicts
// what a play will do, it sends the action and re-renders on the next
// `tableState`/`yourHand`.

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ActionResult,
  ClientToServerEvents,
  HandCard,
  PublicTableState,
} from '@card-game/shared'
import type { GameSocket } from '../socket'
import {
  clearSeatClaim,
  readSeatClaim,
  writeSeatClaim,
  type SeatClaim,
} from './reconnectToken'
import { JoinScreen } from './JoinScreen'
import { Lobby } from './Lobby'
import { InMatch } from './InMatch'
import { Eliminated } from './Eliminated'
import { MatchOver } from './MatchOver'
import { centered, colors } from './styles'

/** Taken from the wire contract rather than restated, so a change to `join`'s
 *  payload breaks here under `tsc` instead of drifting. */
type JoinInput = Parameters<ClientToServerEvents['join']>[0]

export function PlayerClient({ socket }: { socket: GameSocket }) {
  const [table, setTable] = useState<PublicTableState | null>(null)
  const [hand, setHand] = useState<HandCard[]>([])
  const [seatId, setSeatId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const storedClaim = useRef<SeatClaim | null>(readSeatClaim())
  const [defaults, setDefaults] = useState({
    roomCode: storedClaim.current?.roomCode ?? '',
    name: storedClaim.current?.name ?? '',
  })
  // A reclaim is already in flight at first paint when this device has a stored
  // seat, so the join screen must not flash up in front of it.
  const [joining, setJoining] = useState(storedClaim.current !== null)
  // One claim at a time: a double-tapped Join — or React re-running the mount
  // effect — would otherwise ask for a second seat.
  const claiming = useRef(false)
  // Read inside the failure branch, where `seatId`'s own value would be stale.
  const heldSeat = useRef<string | null>(null)

  const claimSeat = useCallback(
    (input: JoinInput) => {
      if (claiming.current) return
      claiming.current = true
      setJoining(true)
      setError(null)
      socket.emit('join', input, (result) => {
        claiming.current = false
        setJoining(false)
        if (result.ok) {
          const claim = {
            roomCode: input.roomCode,
            name: input.name,
            token: result.token,
          }
          storedClaim.current = claim
          writeSeatClaim(claim)
          setDefaults({ roomCode: claim.roomCode, name: claim.name })
          heldSeat.current = result.seatId
          setSeatId(result.seatId)
          return
        }
        setError(result.reason)
        // A rejected reclaim means the stored token is no longer good for a
        // seat — unless this device already holds one, in which case the
        // rejection is a duplicate claim and the seat is untouched.
        if (input.token && heldSeat.current === null) {
          clearSeatClaim()
          storedClaim.current = null
          setSeatId(null)
        }
      })
    },
    [socket],
  )

  useEffect(() => {
    const onTableState = (state: PublicTableState) => setTable(state)
    const onHand = (cards: HandCard[]) => setHand(cards)
    // Fires on the first connection and on every socket.io reconnect. A
    // reconnect arrives as a fresh socket id, so the seat is only kept by
    // handing the token back — that is what makes a dropout survivable inside
    // the server's 60s window.
    const onConnect = () => {
      const claim = storedClaim.current
      if (claim) claimSeat(claim)
    }

    socket.on('tableState', onTableState)
    socket.on('yourHand', onHand)
    socket.on('connect', onConnect)
    if (socket.connected) onConnect()

    return () => {
      socket.off('tableState', onTableState)
      socket.off('yourHand', onHand)
      socket.off('connect', onConnect)
    }
  }, [socket, claimSeat])

  const playCard = useCallback(
    (cardId: string, targetSeatId?: string) =>
      new Promise<ActionResult>((resolve) => {
        setError(null)
        socket.emit('playCard', { cardId, targetSeatId }, (result) => {
          if (!result.ok) setError(result.reason)
          resolve(result)
        })
      }),
    [socket],
  )

  const sendAction = useCallback(
    (event: 'start' | 'newMatch') => {
      setError(null)
      socket.emit(event, (result: ActionResult) => {
        if (!result.ok) setError(result.reason)
      })
    },
    [socket],
  )

  const mySeat =
    table?.seats.find((candidate) => candidate.seatId === seatId) ?? null

  if (seatId === null && !joining) {
    return (
      <JoinScreen
        defaults={defaults}
        error={error}
        busy={joining}
        onJoin={(input) => claimSeat(input)}
      />
    )
  }

  if (!table || !mySeat) {
    return (
      <div style={centered}>
        <p style={{ color: colors.mutedText }}>Connecting…</p>
      </div>
    )
  }

  if (table.phase === 'matchOver') {
    return (
      <MatchOver
        seats={table.seats}
        isHost={mySeat.isHost}
        error={error}
        onNewMatch={() => sendAction('newMatch')}
      />
    )
  }

  if (table.phase === 'lobby') {
    return (
      <Lobby
        seats={table.seats}
        isHost={mySeat.isHost}
        error={error}
        onStart={() => sendAction('start')}
      />
    )
  }

  if (mySeat.eliminated) return <Eliminated />

  const turnSeat = table.seats.find(
    (candidate) => candidate.seatId === table.turnSeatId,
  )

  return (
    <InMatch
      mySeat={mySeat}
      hand={hand}
      isYourTurn={table.turnSeatId === mySeat.seatId}
      turnName={turnSeat?.name ?? null}
      livingOpponents={table.seats.filter(
        (candidate) =>
          candidate.seatId !== mySeat.seatId &&
          candidate.name !== null &&
          !candidate.eliminated,
      )}
      error={error}
      onPlay={playCard}
    />
  )
}
