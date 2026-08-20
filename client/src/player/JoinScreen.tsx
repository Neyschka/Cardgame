// Name + room code, per spec.md's "Player client". The only screen that takes
// free text, and the only one shown before this client holds a seat.
//
// phone-screens.html's "1 · Join" mock shows the room code as four separate
// gold-bordered boxes. Kept as a single field here instead — same visual
// language (large, letter-spaced, gold border that lights up once there's
// something in it), but one input rather than four keeps focus management
// simple and the join flow's test coverage intact.

import { useState } from 'react'
import {
  disabledButton,
  errorText,
  gutter,
  input,
  label,
  primaryButton,
  rule,
  screen,
  subtitle,
  title,
  tokens,
} from './styles'

export interface JoinScreenProps {
  defaults: { roomCode: string; name: string }
  error: string | null
  busy: boolean
  onJoin: (input: { roomCode: string; name: string }) => void
}

export function JoinScreen({ defaults, error, busy, onJoin }: JoinScreenProps) {
  const [name, setName] = useState(defaults.name)
  const [roomCode, setRoomCode] = useState(defaults.roomCode)
  const ready = name.trim() !== '' && roomCode.trim() !== '' && !busy

  return (
    <div style={screen}>
      <form
        style={{
          padding: gutter,
          // Sits below the top edge without stranding the form off a short
          // screen once the keyboard is up.
          marginTop: 'min(60px, 8vh)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onSubmit={(event) => {
          event.preventDefault()
          if (!ready) return
          // Upper-cased because that is how the code reads off the shared
          // screen; the server compares it as given.
          onJoin({
            roomCode: roomCode.trim().toUpperCase(),
            name: name.trim(),
          })
        }}
      >
        <h1 style={title}>Card Game</h1>
        <p style={subtitle}>Enter the code on the big screen</p>
        <hr style={rule} />
        <p style={label}>Room code</p>
        <input
          placeholder="Room code"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
          autoCapitalize="characters"
          style={{
            ...input,
            fontFamily: tokens.fontDisplay,
            fontSize: 'clamp(24px, 8vw, 32px)',
            fontWeight: 700,
            letterSpacing: 8,
            textAlign: 'center',
            color: tokens.goldLt,
            borderColor: roomCode.trim() ? tokens.goldLt : tokens.goldDk,
            boxShadow: roomCode.trim()
              ? '0 0 14px rgba(240,217,138,0.35)'
              : 'none',
          }}
        />
        <hr style={rule} />
        <p style={label}>Your name</p>
        <input
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={input}
        />
        <div style={{ flex: 1, minHeight: 24 }} />
        <button
          type="submit"
          disabled={!ready}
          style={ready ? primaryButton : disabledButton}
        >
          {busy ? 'Joining…' : 'Enter the Fray'}
        </button>
        {error && <p style={{ ...errorText, marginTop: 12 }}>{error}</p>}
      </form>
    </div>
  )
}
