// socket.io wiring only: every handler here reads its payload, hands the work to
// `gameState.ts`, resolves the caller's ack, and re-broadcasts. No game rule is
// decided in this file — see `.scratch/card-game/spec.md`'s "Module layout".

import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'
import { networkInterfaces } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Server } from 'socket.io'
import {
  DISPLAY_CONFIG_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@card-game/shared'
import { createTable, type Table } from './gameState'

export interface TableServerOptions {
  httpServer: HttpServer
  table: Table
  /** How often disconnected seats are swept for the timeout. */
  sweepIntervalMs?: number
}

/** The timeout is the table's own clock, not this one — the sweep only has to
 *  be frequent enough that an expiry surfaces promptly once it is due. */
const DEFAULT_SWEEP_INTERVAL_MS = 1_000

export interface TableServer {
  close(): Promise<void>
}

export function createTableServer(options: TableServerOptions): TableServer {
  const { httpServer, table } = options
  // Attached before socket.io: engine.io wraps whatever request listeners it
  // finds, and calls them for everything that isn't a socket.io request.
  httpServer.on('request', serveDisplayConfig(table))
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    { cors: { origin: '*' } },
  )

  /** The one write path out: public state to everyone, private hands only to
   *  the sockets that own them. Runs after every mutation — an ack says
   *  "accepted", the broadcast says what actually changed. */
  function broadcast() {
    io.emit('tableState', table.publicState())
    for (const { socketId, seatId } of table.seatedSockets()) {
      io.to(socketId).emit('yourHand', table.handFor(seatId))
    }
  }

  /** One action: guard the untrusted ack, run it, answer it whatever happens
   *  (spec.md's "Ack semantics" — nothing is fire-and-forget), then tell the
   *  room if the table moved. A handler that threw its way past the ack would
   *  leave that client waiting on a reply that never comes. */
  function handle<R extends { ok: boolean }>(
    event: string,
    ack: (result: R | Failure) => void,
    run: () => R | Failure,
  ) {
    // No ack to answer: a client that sends none has opted out of hearing back,
    // and there is nowhere to report the failure to.
    if (typeof ack !== 'function') return
    let result: R | Failure
    try {
      result = run()
    } catch (error) {
      // The event name only — a payload can hold a seat's reconnect token.
      console.error(`${event} failed`, error)
      result = SERVER_ERROR
    }
    ack(result)
    if (result.ok) broadcast()
  }

  io.on('connection', (socket) => {
    // So a socket that connects mid-lobby renders at once instead of waiting on
    // someone else to act. `tableState` is public to every socket by design.
    socket.emit('tableState', table.publicState())

    socket.on('join', (input, ack) => {
      handle('join', ack, () => {
        const payload = readJoin(input)
        if (!payload) return MALFORMED
        // One socket, one seat. Every action resolves through the socket that
        // sent it, so a second seat on this socket could never be played — and
        // never being disconnected, it would never time out either: the turn
        // would reach it and park there for good.
        if (table.seatIdForSocket(socket.id) !== null) {
          return { ok: false, reason: 'you already hold a seat' }
        }
        return table.join({ socketId: socket.id, ...payload })
      })
    })

    socket.on('joinAsDisplay', (input, ack) => {
      // Outside `handle`: the display claims no seat, so a successful join
      // changes nothing for anyone else and there is nothing to broadcast.
      if (typeof ack !== 'function') return
      const roomCode = readString(readRecord(input)?.roomCode)
      ack(roomCode === null ? MALFORMED : table.joinAsDisplay({ roomCode }))
    })

    socket.on('start', (ack) => {
      handle('start', ack, () => table.start({ socketId: socket.id }))
    })

    socket.on('newMatch', (ack) => {
      handle('newMatch', ack, () => table.newMatch({ socketId: socket.id }))
    })

    socket.on('playCard', (input, ack) => {
      handle('playCard', ack, () => {
        const payload = readPlay(input)
        if (!payload) return MALFORMED
        return table.playCard({ socketId: socket.id, ...payload })
      })
    })

    socket.on('disconnect', () => {
      if (table.seatIdForSocket(socket.id) === null) return
      // A seated socket dropping can move the turn on, so the room needs to
      // hear about it. Whether the seat is *eliminated* is the sweep's call.
      table.disconnect(socket.id)
      broadcast()
    })
  })

  const sweep = setInterval(() => {
    if (table.expireDisconnected().length > 0) broadcast()
  }, options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS)
  // Nothing about a table's timeouts should keep the process alive on its own.
  sweep.unref()

  return {
    async close() {
      clearInterval(sweep)
      await io.close()
    },
  }
}

// --- display config ---------------------------------------------------------

function serveDisplayConfig(table: Table) {
  return (request: IncomingMessage, response: ServerResponse) => {
    // Nothing else is served yet — a static build of the client would slot in
    // ahead of this 404 (ADR-0001's single origin).
    if ((request.url ?? '').split('?')[0] !== DISPLAY_CONFIG_PATH) {
      response.writeHead(404).end()
      return
    }
    const { roomCode, lanAddress } = table.publicState()
    response.writeHead(200, {
      'content-type': 'application/json',
      // The display is served by Vite on another origin in dev. The room code
      // is not a secret — it goes on the shared screen for the room to read,
      // and ADR-0001 puts the whole server on a LAN.
      'access-control-allow-origin': '*',
    })
    response.end(JSON.stringify({ roomCode, lanAddress }))
  }
}

// --- payload readers --------------------------------------------------------
// Everything a socket sends is untrusted: a phone on the LAN can emit any shape
// at all, including no ack to answer. A handler that trusts its arguments takes
// the whole table down with it, so each payload is read before it is used.

/** The failure member `ActionResult` and `JoinResult` share, so one value can
 *  answer either ack. */
type Failure = { ok: false; reason: string }

const MALFORMED: Failure = { ok: false, reason: 'malformed request' }
const SERVER_ERROR: Failure = { ok: false, reason: 'server error' }

const readRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null

const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

/** A name is echoed to every client and printed across a shared screen, so it
 *  is capped here rather than trusted at whatever length it arrives. */
const MAX_NAME_LENGTH = 24

/** Absent is fine, present-but-not-a-string is not — that has to be rejected
 *  rather than quietly dropped. */
const isMissingOrString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string'

function readJoin(
  input: unknown,
): { roomCode: string; name: string; token?: string } | null {
  const record = readRecord(input)
  if (!record) return null
  const roomCode = readString(record.roomCode)
  const name = readString(record.name)
  const token = record.token
  if (roomCode === null || name === null) return null
  if (!isMissingOrString(token)) return null
  return { roomCode, name: name.slice(0, MAX_NAME_LENGTH), token }
}

function readPlay(
  input: unknown,
): { cardId: string; targetSeatId?: string } | null {
  const record = readRecord(input)
  if (!record) return null
  const cardId = readString(record.cardId)
  const targetSeatId = record.targetSeatId
  if (cardId === null) return null
  if (!isMissingOrString(targetSeatId)) return null
  return { cardId, targetSeatId }
}

// --- process entry point ----------------------------------------------------

const DEFAULT_PORT = 3001
const ROOM_CODE_LENGTH = 4
/** No O/0 or I/1: this gets read off a TV from across the room. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomCode(): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
    return ROOM_CODE_ALPHABET[index] ?? 'A'
  }).join('')
}

/** What a phone has to type in, so it has to be this machine's LAN address —
 *  never a loopback one. Behind Docker that is the container's address rather
 *  than the host's, which is what `LAN_ADDRESS` is for. */
function detectLanAddress(port: number): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return `${address.address}:${port}`
      }
    }
  }
  return `localhost:${port}`
}

/** Only when run as the process entry — importing this module (the tests do)
 *  must not bind a port. */
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntryPoint) {
  const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT
  const roomCode = process.env.ROOM_CODE?.toUpperCase() || generateRoomCode()
  const lanAddress = process.env.LAN_ADDRESS || detectLanAddress(port)
  const httpServer = createServer()
  // One table per server instance, per ADR-0001.
  createTableServer({ httpServer, table: createTable({ roomCode, lanAddress }) })
  httpServer.listen(port, () => {
    console.log(`server listening on :${port}`)
    console.log(`table open at ${lanAddress} — room code ${roomCode}`)
  })
}
