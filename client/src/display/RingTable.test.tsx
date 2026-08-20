import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { PublicSeat, PublicTableState } from '@card-game/shared'
import { RingTable } from './RingTable'

afterEach(cleanup)

function seat(overrides: Partial<PublicSeat> & { seatId: string }): PublicSeat {
  return {
    name: null,
    isHost: false,
    hp: 10,
    shielded: false,
    eliminated: false,
    handCount: 0,
    ...overrides,
  }
}

function table(overrides: Partial<PublicTableState>): PublicTableState {
  return {
    roomCode: 'FOXY',
    lanAddress: '192.168.1.42:5173',
    phase: 'lobby',
    seats: [
      seat({ seatId: 'seat-1' }),
      seat({ seatId: 'seat-2' }),
      seat({ seatId: 'seat-3' }),
      seat({ seatId: 'seat-4' }),
    ],
    turnSeatId: null,
    lastPlayed: null,
    eliminationOrder: [],
    matchResult: null,
    ...overrides,
  }
}

describe('RingTable — lobby', () => {
  it('shows the room code and LAN address for others to join', () => {
    render(<RingTable table={table({})} />)
    expect(screen.getByText('FOXY')).toBeTruthy()
    expect(screen.getByText('192.168.1.42:5173')).toBeTruthy()
  })

  it('shows a plain join-count readout in the center', () => {
    render(
      <RingTable
        table={table({
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true }),
            seat({ seatId: 'seat-2' }),
            seat({ seatId: 'seat-3' }),
            seat({ seatId: 'seat-4' }),
          ],
        })}
      />,
    )
    expect(screen.getByText('1/4 joined')).toBeTruthy()
  })

  it('shows every seat, including open ones, so newcomers see where to join', () => {
    render(
      <RingTable
        table={table({
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true }),
            seat({ seatId: 'seat-2' }),
            seat({ seatId: 'seat-3' }),
            seat({ seatId: 'seat-4' }),
          ],
        })}
      />,
    )
    expect(screen.getByText('Priya')).toBeTruthy()
    expect(screen.getAllByText('open seat')).toHaveLength(3)
  })

  it('never shows HP or a hand fan before a match has started', () => {
    render(
      <RingTable
        table={table({
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true, handCount: 0 }),
            seat({ seatId: 'seat-2' }),
            seat({ seatId: 'seat-3' }),
            seat({ seatId: 'seat-4' }),
          ],
        })}
      />,
    )
    expect(screen.queryByText(/HP/)).toBeNull()
  })
})

describe('RingTable — in match', () => {
  it('shows only the seated players, not unclaimed seats', () => {
    render(
      <RingTable
        table={table({
          phase: 'inMatch',
          turnSeatId: 'seat-1',
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true, hp: 10, handCount: 5 }),
            seat({ seatId: 'seat-2', name: 'Marcus', hp: 6, handCount: 4 }),
            seat({ seatId: 'seat-3' }),
            seat({ seatId: 'seat-4' }),
          ],
        })}
      />,
    )
    expect(screen.getByText('Priya')).toBeTruthy()
    expect(screen.getByText('Marcus')).toBeTruthy()
    expect(screen.queryByText('open seat')).toBeNull()
  })

  it("doesn't show the room code once the match has started", () => {
    render(
      <RingTable
        table={table({
          phase: 'inMatch',
          turnSeatId: 'seat-1',
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true }),
            seat({ seatId: 'seat-2', name: 'Marcus' }),
          ],
        })}
      />,
    )
    expect(screen.queryByText('FOXY')).toBeNull()
  })

  it('shows HP, shield, and a hand-count fan for a living seat', () => {
    render(
      <RingTable
        table={table({
          phase: 'inMatch',
          turnSeatId: 'seat-1',
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true, hp: 6, shielded: true, handCount: 3 }),
            seat({ seatId: 'seat-2', name: 'Marcus', hp: 10 }),
          ],
        })}
      />,
    )
    expect(screen.getByText(/6 HP/)).toBeTruthy()
    expect(screen.getByText(/shielded/)).toBeTruthy()
    expect(screen.getByTestId('hand-fan-seat-1').children).toHaveLength(3)
  })

  it('shows the last played card face-up with who played it', () => {
    render(
      <RingTable
        table={table({
          phase: 'inMatch',
          turnSeatId: 'seat-2',
          lastPlayed: { type: 'Attack', value: 3, bySeatId: 'seat-1' },
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true }),
            seat({ seatId: 'seat-2', name: 'Marcus' }),
          ],
        })}
      />,
    )
    expect(screen.getByText('Attack 3')).toBeTruthy()
    expect(screen.getByText('played by Priya')).toBeTruthy()
  })

  it('shows a placeholder before any card has been played', () => {
    render(
      <RingTable
        table={table({
          phase: 'inMatch',
          turnSeatId: 'seat-1',
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true }),
            seat({ seatId: 'seat-2', name: 'Marcus' }),
          ],
        })}
      />,
    )
    expect(screen.getByText('no card played yet')).toBeTruthy()
  })

  it('marks an eliminated seat OUT, dimmed, with its hand fan hidden', () => {
    render(
      <RingTable
        table={table({
          phase: 'inMatch',
          turnSeatId: 'seat-1',
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', isHost: true }),
            seat({ seatId: 'seat-2', name: 'Marcus', eliminated: true, handCount: 0 }),
          ],
        })}
      />,
    )
    expect(screen.getByText('OUT')).toBeTruthy()
    expect(screen.getByText(/HP/)).toBeTruthy() // Priya's HP still shows
    const marcus = screen.getByTestId('seat-seat-2')
    expect(marcus.textContent).not.toMatch(/HP/)
    expect(screen.queryByTestId('hand-fan-seat-2')).toBeNull()
  })
})

describe('RingTable — match over', () => {
  const finishedSeats: PublicSeat[] = [
    seat({ seatId: 'seat-1', name: 'Priya', isHost: true, hp: 6 }),
    seat({ seatId: 'seat-2', name: 'Marcus', eliminated: true, hp: 0 }),
    seat({ seatId: 'seat-3', name: 'Dana', eliminated: true, hp: 0 }),
  ]

  it('shows the winner and the elimination chain ending at them', () => {
    render(
      <RingTable
        table={table({
          phase: 'matchOver',
          seats: finishedSeats,
          eliminationOrder: ['seat-3', 'seat-2'],
          matchResult: { winnerSeatId: 'seat-1' },
        })}
      />,
    )
    expect(screen.getByText('Priya wins!')).toBeTruthy()
    const card = screen.getByTestId('match-over-card')
    expect(card.textContent).toContain('Dana → Marcus → Priya')
  })

  it('shows a draw with no winner highlighted', () => {
    render(
      <RingTable
        table={table({
          phase: 'matchOver',
          seats: [
            seat({ seatId: 'seat-1', name: 'Priya', eliminated: true, hp: 0 }),
            seat({ seatId: 'seat-2', name: 'Marcus', eliminated: true, hp: 0 }),
          ],
          eliminationOrder: ['seat-1', 'seat-2'],
          matchResult: { draw: true },
        })}
      />,
    )
    expect(screen.getByText('Draw!')).toBeTruthy()
  })

  it('keeps seats in their in-match cardinal positions, winner highlighted', () => {
    render(
      <RingTable
        table={table({
          phase: 'matchOver',
          seats: finishedSeats,
          eliminationOrder: ['seat-3', 'seat-2'],
          matchResult: { winnerSeatId: 'seat-1' },
        })}
      />,
    )
    expect(screen.getByTestId('seat-seat-1')).toBeTruthy()
    expect(screen.getByTestId('seat-seat-2')).toBeTruthy()
    expect(screen.getByTestId('seat-seat-3')).toBeTruthy()
    expect(screen.getAllByText('OUT')).toHaveLength(2)
  })
})
