import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createFakeSocket } from './testSocket'
import App from './App'

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.pushState({}, '', '/')
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('opens on the player client, with no seat claimed yet', () => {
    render(<App socket={createFakeSocket().socket} />)

    expect(screen.getByText('Join a table')).toBeTruthy()
  })

  it('routes to the display client via ?display', () => {
    window.history.pushState({}, '', '/?display')
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    render(<App socket={createFakeSocket().socket} />)

    expect(screen.queryByText('Join a table')).toBeNull()
    expect(screen.getByText('Connecting…')).toBeTruthy()
  })
})
