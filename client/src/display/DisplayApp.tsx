// Connects the display client to the table: reads the server-injected room
// code (spec.md's "Join / reconnect" — nobody types it in), joins via
// `joinAsDisplay`, then renders whatever `tableState` broadcasts. This is the
// only place that talks to the socket; `RingTable` is a pure render of
// whatever state lands here.
import { useEffect, useState } from 'react'
import { DISPLAY_CONFIG_PATH, type PublicTableState } from '@card-game/shared'
import type { GameSocket } from '../socket'
import { RingTable } from './RingTable'

type ConnectionState =
  | { status: 'connecting' }
  | { status: 'error'; reason: string }
  | { status: 'connected'; table: PublicTableState }

export function DisplayApp({ socket }: { socket: GameSocket }) {
  const [state, setState] = useState<ConnectionState>({ status: 'connecting' })

  useEffect(() => {
    let cancelled = false

    function onTableState(table: PublicTableState) {
      if (!cancelled) setState({ status: 'connected', table })
    }

    async function connect() {
      const response = await fetch(DISPLAY_CONFIG_PATH)
      if (!response.ok) {
        throw new Error(`could not load display config (${response.status})`)
      }
      const { roomCode } = (await response.json()) as { roomCode: string }
      if (cancelled) return

      socket.on('tableState', onTableState)
      socket.emit('joinAsDisplay', { roomCode }, (result) => {
        if (cancelled) return
        if (!result.ok) setState({ status: 'error', reason: result.reason })
      })
    }

    connect().catch((error: unknown) => {
      if (cancelled) return
      const reason =
        error instanceof Error ? error.message : 'connection failed'
      setState({ status: 'error', reason })
    })

    return () => {
      cancelled = true
      socket.off('tableState', onTableState)
    }
  }, [socket])

  if (state.status === 'connecting') return <StatusScreen text="Connecting…" />
  if (state.status === 'error')
    return <StatusScreen text={`Couldn't connect: ${state.reason}`} />
  return <RingTable table={state.table} />
}

function StatusScreen({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: 'sans-serif',
        color: '#eee',
        background: '#0b1220',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
      }}
    >
      {text}
    </div>
  )
}
