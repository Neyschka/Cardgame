// The reconnect token's home on this device. A seat is reclaimed by handing the
// token back to `join` (spec.md's "Join / reconnect"), so the room code and name
// ride along with it — `join` needs all three, and a reload has no other source
// for them.
//
// Lifetime: spec.md says a token is "invalidated once the match ends or a new
// match starts", but the server deliberately deviates — `gameState.ts`'s
// `mintToken` explains that a token instead dies with the seat it belongs to,
// because the wire contract has no way to hand a rotated one to an already
// connected client. Nothing is cleared here at match end for the same reason;
// a claim is dropped only when the server refuses it.

const STORAGE_KEY = 'card-game:seat-claim'

/** Everything `join` needs to reclaim this device's seat. */
export interface SeatClaim {
  roomCode: string
  name: string
  token: string
}

const isSeatClaim = (value: unknown): value is SeatClaim =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SeatClaim).roomCode === 'string' &&
  typeof (value as SeatClaim).name === 'string' &&
  typeof (value as SeatClaim).token === 'string'

/** Anything that wouldn't survive being handed straight to `join` reads as no
 *  claim at all: a half-written or stale-shaped value should send the player to
 *  the join screen, not into a malformed rejoin. */
export function readSeatClaim(): SeatClaim | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return null
  try {
    const parsed: unknown = JSON.parse(stored)
    return isSeatClaim(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeSeatClaim(claim: SeatClaim): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(claim))
}

export function clearSeatClaim(): void {
  localStorage.removeItem(STORAGE_KEY)
}
