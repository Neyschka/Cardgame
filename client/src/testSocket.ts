// A stand-in for the real socket, so the clients can be tested against the wire
// contract without a server: tests push `tableState`/`yourHand` in and read back
// the actions the client sent, resolving each ack by hand.

import type {
  HandCard,
  PublicTableState,
  ServerToClientEvents,
} from '@card-game/shared'
import type { GameSocket } from './socket'

type Listener = (...args: never[]) => void

export interface SentAction {
  event: string
  /** Absent for the payload-less actions (`start`, `newMatch`). */
  payload: unknown
  ack: (result: unknown) => void
}

export interface FakeSocket {
  socket: GameSocket
  sent: SentAction[]
  /** The most recent send of `event`, or a thrown error naming what was sent
   *  instead — a missing action should fail the assertion, not the next line. */
  lastSent(event: string): SentAction
  /** Fires the `connect` listeners, as socket.io does on a reconnect. */
  connect(): void
  /** Fires the `disconnect` listeners, as socket.io does when the transport
   *  drops. */
  disconnect(): void
  serverEmit<E extends keyof ServerToClientEvents>(
    event: E,
    payload: E extends 'tableState' ? PublicTableState : HandCard[],
  ): void
}

export function createFakeSocket(): FakeSocket {
  const listeners = new Map<string, Set<Listener>>()
  const sent: SentAction[] = []

  const fire = (event: string, ...args: unknown[]) => {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      ;(listener as (...a: unknown[]) => void)(...args)
    }
  }

  const socket = {
    // Always connected: these tests exercise what the client does once it has a
    // socket, not socket.io's own connection handling.
    connected: true,
    on(event: string, listener: Listener) {
      const forEvent = listeners.get(event) ?? new Set<Listener>()
      forEvent.add(listener)
      listeners.set(event, forEvent)
      return socket
    },
    off(event: string, listener?: Listener) {
      if (listener) listeners.get(event)?.delete(listener)
      else listeners.delete(event)
      return socket
    },
    emit(event: string, ...args: unknown[]) {
      const last = args.at(-1)
      const ack =
        typeof last === 'function' ? (last as SentAction['ack']) : () => {}
      const payload =
        typeof last === 'function' && args.length < 2 ? undefined : args[0]
      sent.push({ event, payload, ack })
      return socket
    },
  }

  return {
    socket: socket as unknown as GameSocket,
    sent,
    lastSent(event) {
      const match = sent.filter((action) => action.event === event).at(-1)
      if (!match) {
        throw new Error(
          `no "${event}" sent; sent: ${sent.map((a) => a.event).join(', ') || '(nothing)'}`,
        )
      }
      return match
    },
    connect() {
      fire('connect')
    },
    disconnect() {
      fire('disconnect')
    },
    serverEmit(event, payload) {
      fire(event, payload)
    },
  }
}
