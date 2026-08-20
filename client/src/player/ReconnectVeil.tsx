// Overlaid on whatever screen is showing the instant this device's own
// socket drops — the seat itself survives on the server for
// DISCONNECT_TIMEOUT_MS (spec.md's "Reconnect & idle-timeout"), and
// `PlayerClient`'s `onConnect` handler already re-sends the stored token the
// moment the socket reconnects, so there's no protocol change here: this is
// purely the client-side countdown that tells the player how much of that
// window is left.

import { useEffect, useState } from 'react'
import { colors, title, tokens } from './styles'

const RECLAIM_WINDOW_S = 60

export function ReconnectVeil({ disconnectedAt }: { disconnectedAt: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const elapsed = Math.floor((now - disconnectedAt) / 1000)
  const remaining = Math.max(0, RECLAIM_WINDOW_S - elapsed)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(7,6,15,0.92)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ fontSize: 44 }}>📡</div>
      <p style={{ ...title, fontSize: 22, margin: 0 }}>Reconnecting…</p>
      <p
        style={{
          color: colors.mutedText,
          margin: 0,
          fontFamily: tokens.fontBody,
        }}
      >
        {remaining > 0
          ? `${remaining}s left to reclaim your seat`
          : 'Still trying — your seat may be gone'}
      </p>
    </div>
  )
}
