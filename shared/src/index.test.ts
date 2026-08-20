import { describe, expect, it } from 'vitest';
import type {
  ActionResult,
  CardEffect,
  ClientToServerEvents,
  HandCard,
  JoinResult,
  MatchResult,
  PublicSeat,
  PublicTableState,
  ServerToClientEvents,
} from './index';

// This package is types-only — there is no runtime logic to test. These cases
// exist as compile-time conformance checks on the wire contract: they fail
// under `tsc` if a payload shape drifts from what the spec pins down.

const lobby: PublicTableState = {
  roomCode: 'ABCD',
  lanAddress: '192.168.1.20:3001',
  phase: 'lobby',
  seats: [],
  turnSeatId: null,
  chainCount: 0,
  lastPlayed: null,
  eliminationOrder: [],
  matchResult: null,
};

const seat: PublicSeat = {
  seatId: 'seat-1',
  name: 'Ada',
  deckId: 'red',
  isHost: true,
  hp: 10,
  shields: 0,
  eliminated: false,
  handCount: 3,
};

const attackEffect: CardEffect = { kind: 'attack', value: 2, target: 'single' };

describe('wire contract', () => {
  it('accepts a full in-match table state', () => {
    const state = {
      ...lobby,
      phase: 'inMatch',
      seats: [
        seat,
        { ...seat, seatId: 'seat-2', name: null, deckId: null, isHost: false },
      ],
      turnSeatId: 'seat-1',
      chainCount: 1,
      lastPlayed: {
        defId: 'ember_bolt',
        name: 'Ember Bolt',
        effects: [attackEffect],
        bySeatId: 'seat-2',
        targetSeatId: 'seat-1',
      },
    } satisfies PublicTableState;

    expect(state.seats).toHaveLength(2);
  });

  it('models a card with combined effects and a playAgain flag', () => {
    const hand = [
      {
        id: 'c1',
        defId: 'kindle',
        name: 'Kindle',
        effects: [attackEffect],
        playAgain: true,
        needsTarget: true,
      },
      {
        id: 'c2',
        defId: 'cinder_ward',
        name: 'Cinder Ward',
        effects: [{ kind: 'shield', value: 1, target: 'single' }],
        playAgain: false,
        needsTarget: false,
      },
    ] satisfies HandCard[];

    expect(hand.filter((card) => card.playAgain)).toHaveLength(1);
  });

  it('discriminates action and join results on `ok`', () => {
    const rejected: ActionResult = { ok: false, reason: 'not your turn' };
    const joined: JoinResult = { ok: true, seatId: 'seat-1', token: 'tok-abc' };

    expect(rejected.ok ? null : rejected.reason).toBe('not your turn');
    expect(joined.ok ? joined.seatId : null).toBe('seat-1');
  });

  it('models both match outcomes', () => {
    const win = { winnerSeatId: 'seat-1' } satisfies MatchResult;
    const draw = { draw: true } satisfies MatchResult;

    expect('winnerSeatId' in win).toBe(true);
    expect('draw' in draw).toBe(true);
  });

  it('keeps card contents off the public seat shape', () => {
    // Fails to compile if a card-carrying field is ever added to `PublicSeat`,
    // which is the mechanism that keeps a hand out of a `tableState` broadcast.
    type CardFieldNames = 'hand' | 'cards' | 'deck' | 'discard';
    type LeakedFields = Extract<keyof PublicSeat, CardFieldNames>;
    type NoCardContents = [LeakedFields] extends [never] ? true : never;

    const handsStayPrivate: NoCardContents = true;

    expect(handsStayPrivate).toBe(true);
  });

  it('pins the event signatures both directions', () => {
    // These handlers only have to type-check: an added, renamed or
    // no-longer-optional field on any payload breaks them under `tsc`.
    const serverToClient = {
      tableState: (state: PublicTableState) => void state.seats,
      yourHand: (hand: HandCard[]) => void hand.length,
    } satisfies ServerToClientEvents;

    const clientToServer = {
      join: ({ roomCode, name, token }, ack) =>
        token
          ? ack({ ok: true, seatId: 'seat-1', token })
          : ack({ ok: false, reason: `${roomCode}/${name} has no seat` }),
      joinAsDisplay: ({ roomCode }, ack) =>
        ack(roomCode ? { ok: true } : { ok: false, reason: 'no room code' }),
      start: (ack) => ack({ ok: true }),
      playCard: ({ cardId, targetSeatId }, ack) =>
        ack(
          targetSeatId
            ? { ok: true }
            : { ok: false, reason: `${cardId} needs a target` },
        ),
      newMatch: (ack) => ack({ ok: true }),
    } satisfies ClientToServerEvents;

    expect(Object.keys(serverToClient)).toEqual(['tableState', 'yourHand']);
    expect(Object.keys(clientToServer)).toHaveLength(5);
  });
});
