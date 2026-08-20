// Thin typed wrapper around socket.io-client — no game logic here (spec.md's
// "Module layout"). Shared by the display and player clients (tasks 04/05);
// each client renders whatever the server broadcasts.

import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@card-game/shared'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** `url` defaults to the page's own origin, which is the only address that
 *  exists in production — one process serves the client and the socket on one
 *  port (ADR-0001). The end-to-end tests pass an explicit origin because their
 *  server binds an ephemeral port. */
export function createSocket(url?: string): GameSocket {
  return url === undefined ? io() : io(url)
}
