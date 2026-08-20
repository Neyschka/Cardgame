// Name + room code, per spec.md's "Player client". The only screen that takes
// free text, and the only one shown before this client holds a seat.

import { useState } from 'react'
import {
  disabledButton,
  errorText,
  gutter,
  input,
  primaryButton,
  screen,
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
          gap: 16,
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
        <h2 style={{ textAlign: 'center', margin: 0 }}>Join a table</h2>
        <input
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={input}
        />
        <input
          placeholder="Room code"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
          autoCapitalize="characters"
          style={{ ...input, letterSpacing: 4, textAlign: 'center' }}
        />
        <button
          type="submit"
          disabled={!ready}
          style={ready ? primaryButton : disabledButton}
        >
          Join
        </button>
        {error && <p style={errorText}>{error}</p>}
      </form>
    </div>
  )
}
