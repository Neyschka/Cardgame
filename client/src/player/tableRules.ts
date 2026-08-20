// The two table limits this client has to know to render a control's enabled
// state. They mirror `server/src/gameState.ts`'s `MIN_PLAYERS`/`SEAT_COUNT`,
// which remain the enforcing copy — nothing here decides whether a match may
// start, it only decides what the button looks like before the server answers.

export const MIN_PLAYERS = 2
export const MAX_SEATS = 4

/** Seats a Start/New match control counts as filled.
 *
 *  Not quite the server's count: it also excludes a seat past its 60s
 *  disconnect window, and `PublicTableState` deliberately carries no
 *  disconnected/connected distinction (spec.md's "Public vs. internal state"),
 *  so the client cannot see that. The gap shows up as a Start button that looks
 *  enabled and comes back `{ok:false, reason:"need at least 2 players"}` —
 *  which is surfaced to the host either way. */
export const claimedSeats = <T extends { name: string | null }>(seats: T[]) =>
  seats.filter((seat) => seat.name !== null)
