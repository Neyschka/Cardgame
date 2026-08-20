import type { GameSocket } from './socket'
import { DisplayApp } from './display/DisplayApp'
import { PlayerClient } from './player/PlayerClient'

// Routing convention (task 04's call, no prior convention existed): the
// display client is reached via `?display` on the same origin — e.g.
// `http://<lan-address>/?display` — vs. the bare origin for the player
// client. No router library is warranted for a two-role, two-page app.
const isDisplay = () =>
  new URLSearchParams(window.location.search).has('display')

// The socket arrives as a prop rather than being opened here: one connection is
// made at the edge (`main.tsx`) and handed down, so rendering a client never
// opens a socket as a side effect and a test can pass a fake one.
function App({ socket }: { socket: GameSocket }) {
  if (isDisplay()) return <DisplayApp socket={socket} />
  return <PlayerClient socket={socket} />
}

export default App
