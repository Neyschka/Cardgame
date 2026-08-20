// Exercises the connection handshake in isolation: a fake `fetch` stands in
// for the server's `/display-config` endpoint, `testSocket.ts`'s fake socket
// stands in for the real one. `RingTable.test.tsx` covers what gets rendered
// once connected — this file is only about getting there.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { PublicTableState } from '@card-game/shared'
import { createFakeSocket } from '../testSocket'
import { DisplayApp } from './DisplayApp'

function tableState(overrides: Partial<PublicTableState> = {}): PublicTableState {
  return {
    roomCode: 'FOXY',
    lanAddress: '192.168.1.42:5173',
    phase: 'lobby',
    seats: [],
    turnSeatId: null,
    lastPlayed: null,
    eliminationOrder: [],
    matchResult: null,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DisplayApp', () => {
  it('reads the server-injected room code and joins as display with it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roomCode: 'FOXY' }) }),
    )
    const fake = createFakeSocket()

    render(<DisplayApp socket={fake.socket} />)

    await waitFor(() => expect(fake.lastSent('joinAsDisplay')).toBeTruthy())
    expect(fake.lastSent('joinAsDisplay').payload).toEqual({ roomCode: 'FOXY' })
  })

  it('renders the ring table once tableState arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roomCode: 'FOXY' }) }),
    )
    const fake = createFakeSocket()

    render(<DisplayApp socket={fake.socket} />)
    await waitFor(() => expect(fake.lastSent('joinAsDisplay')).toBeTruthy())

    fake.serverEmit('tableState', tableState())

    expect(await screen.findByText('FOXY')).toBeTruthy()
  })

  it('shows an error if the join is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roomCode: 'WRONG' }) }),
    )
    const fake = createFakeSocket()

    render(<DisplayApp socket={fake.socket} />)
    await waitFor(() => expect(fake.lastSent('joinAsDisplay')).toBeTruthy())

    fake.lastSent('joinAsDisplay').ack({ ok: false, reason: 'wrong room code' })

    expect(await screen.findByText(/wrong room code/)).toBeTruthy()
  })

  it('shows an error if the display config request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const fake = createFakeSocket()

    render(<DisplayApp socket={fake.socket} />)

    expect(await screen.findByText(/Couldn't connect/)).toBeTruthy()
  })
})
