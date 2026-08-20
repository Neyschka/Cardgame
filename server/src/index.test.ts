// Integration tests for the socket wiring: a real in-process socket.io server
// and real socket.io clients, asserted purely through emitted events and acks.
// The state machine's rules are `gameState.test.ts`'s job — everything here is
// about what does (and doesn't) reach a given socket.

import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as openSocket, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  HandCard,
  PublicTableState,
  ServerToClientEvents,
} from '@card-game/shared';
import {
  createTable,
  DISCONNECT_TIMEOUT_MS,
  type Table,
  type TableOptions,
} from './gameState';
import { createTableServer } from './index';
import { deckOrderedBy } from './testFixtures';

const ROOM_CODE = 'ABCD';
const LAN_ADDRESS = '192.168.1.20:3001';
/** Fast enough that a test never waits on it, slow enough not to spin. */
const SWEEP_INTERVAL_MS = 5;
const WAIT_TIMEOUT_MS = 2_000;

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const teardown: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (teardown.length > 0) await teardown.pop()?.();
});

/** Polls until `read` returns something, so a test never races an event that
 *  landed before it started looking. */
async function waitFor<T>(what: string, read: () => T | undefined): Promise<T> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

interface TestClient {
  socket: ClientSocket;
  /** Every `tableState` this socket has received, oldest first. */
  states: PublicTableState[];
  /** Every `yourHand` this socket has received, oldest first. */
  hands: HandCard[][];
  /** Drops the connection, waiting for `witness` to see the resulting
   *  broadcast — the server has provably noticed by then. */
  drop(witness: TestClient): Promise<void>;
}

interface SeatedClient extends TestClient {
  seatId: string;
  token: string;
}

interface ServerOptions {
  table?: Partial<TableOptions>;
  /** Swaps in a table that misbehaves, to test how the wiring answers. */
  wrapTable?: (table: Table) => Table;
}

async function startServer(options: ServerOptions = {}) {
  let clock = 10_000;
  const table = createTable({
    roomCode: ROOM_CODE,
    lanAddress: LAN_ADDRESS,
    now: () => clock,
    // Deterministic, not `seededRandom()`: the first seat to join always
    // lands the first still-available class (red, for a table nobody has
    // left) — several tests below rely on knowing what Alice was dealt.
    random: () => 0,
    shuffleDeck: (cards) => cards,
    shuffleTurnOrder: (seatIds) => [...seatIds],
    ...options.table,
  });
  const httpServer = createServer();
  const server = createTableServer({
    httpServer,
    table: options.wrapTable ? options.wrapTable(table) : table,
    sweepIntervalMs: SWEEP_INTERVAL_MS,
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('server did not bind a port');
  }
  const { port } = address;
  teardown.push(() => server.close());

  async function client(): Promise<TestClient> {
    const socket: ClientSocket = openSocket(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    const states: PublicTableState[] = [];
    const hands: HandCard[][] = [];
    socket.on('tableState', (state) => states.push(state));
    socket.on('yourHand', (hand) => hands.push(hand));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    teardown.push(() => {
      socket.disconnect();
    });
    return {
      socket,
      states,
      hands,
      async drop(witness) {
        const seen = witness.states.length;
        socket.disconnect();
        await waitFor('the server to notice the drop', () =>
          witness.states.length > seen ? true : undefined,
        );
      },
    };
  }

  /** One socket per player, joined in order — seat 1 is the host. */
  async function seatPlayers(...names: string[]): Promise<SeatedClient[]> {
    const seated: SeatedClient[] = [];
    for (const name of names) {
      const player = await client();
      const ack = await player.socket.emitWithAck('join', {
        roomCode: ROOM_CODE,
        name,
      });
      if (!ack.ok) throw new Error(ack.reason);
      seated.push({ ...player, seatId: ack.seatId, token: ack.token });
    }
    return seated;
  }

  return {
    client,
    seatPlayers,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

/** The hand a seat has been dealt, once it has one. */
const dealtHand = (player: TestClient) =>
  waitFor(`a dealt hand`, () =>
    player.hands.find((cards) => cards.length === 3),
  );

describe('server socket wiring', () => {
  it('broadcasts tableState to every connected socket when a seat is claimed', async () => {
    const server = await startServer();
    const display = await server.client();
    const alice = await server.client();

    const ack = await alice.socket.emitWithAck('join', {
      roomCode: ROOM_CODE,
      name: 'Alice',
    });

    expect(ack).toEqual({
      ok: true,
      seatId: 'seat-1',
      token: expect.any(String),
    });
    const seen = await waitFor('the display to see Alice seated', () =>
      display.states.find((state) => state.seats[0]?.name === 'Alice'),
    );
    expect(seen.seats[0]).toMatchObject({
      isHost: true,
      hp: 10,
      handCount: 0,
      deckId: 'red',
    });
    expect(seen.phase).toBe('lobby');
    expect(seen.roomCode).toBe(ROOM_CODE);
    expect(seen.lanAddress).toBe(LAN_ADDRESS);
  });

  it('deals each seated socket its own hand and no hand to the display', async () => {
    const server = await startServer();
    const display = await server.client();
    const [alice, bob] = await server.seatPlayers('Alice', 'Bob');

    const ack = await alice.socket.emitWithAck('start');

    expect(ack).toEqual({ ok: true });
    const aliceHand = await dealtHand(alice);
    const bobHand = await dealtHand(bob);
    // Every card belongs to exactly one hand — neither seat sees the other's.
    const aliceIds = aliceHand.map((card) => card.id);
    expect(bobHand.filter((card) => aliceIds.includes(card.id))).toEqual([]);
    expect(display.hands).toEqual([]);

    const inMatch = await waitFor('the display to see the match start', () =>
      display.states.find((state) => state.phase === 'inMatch'),
    );
    expect(inMatch.seats.slice(0, 2).map((seat) => seat.handCount)).toEqual([
      3, 3,
    ]);
    expect(inMatch.turnSeatId).toBe('seat-1');
    // The privacy guarantee, checked against the payload rather than its shape:
    // no dealt card id can be read out of any broadcast state.
    const dealt = [...aliceIds, ...bobHand.map((card) => card.id)];
    for (const state of [...display.states, ...alice.states, ...bob.states]) {
      const serialized = JSON.stringify(state);
      expect(dealt.filter((id) => serialized.includes(id))).toEqual([]);
    }
  });

  it('plays a targeted card and broadcasts the result to everyone', async () => {
    const server = await startServer();
    const display = await server.client();
    const [alice, bob] = await server.seatPlayers('Alice', 'Bob');
    await alice.socket.emitWithAck('start');
    const hand = await dealtHand(alice);
    const attack = hand.find((card) => card.needsTarget);
    if (!attack)
      throw new Error('expected a card needing a target in the opening hand');
    const damage = attack.effects
      .filter((e) => e.kind === 'attack')
      .reduce((sum, e) => sum + e.value, 0);

    const ack = await alice.socket.emitWithAck('playCard', {
      cardId: attack.id,
      targetSeatId: bob.seatId,
    });

    expect(ack).toEqual({ ok: true });
    const resolved = await waitFor('the display to see the attack land', () =>
      display.states.find((state) => state.lastPlayed !== null),
    );
    expect(resolved.lastPlayed).toEqual({
      defId: attack.defId,
      name: attack.name,
      effects: attack.effects,
      bySeatId: alice.seatId,
      targetSeatId: bob.seatId,
    });
    expect(resolved.seats[1]?.hp).toBe(10 - damage);
    // The card left Alice's hand and her private view was re-sent.
    await waitFor('Alice to see the played card leave her hand', () =>
      alice.hands.find((cards) => cards.every((card) => card.id !== attack.id)),
    );
  });

  it('rejects a play out of turn through its own ack, changing nothing', async () => {
    const server = await startServer();
    const display = await server.client();
    const [alice, bob] = await server.seatPlayers('Alice', 'Bob');
    await alice.socket.emitWithAck('start');
    const alicesHand = await dealtHand(alice);
    const bobsHand = await dealtHand(bob);
    await waitFor('the match to start', () =>
      display.states.find((state) => state.phase === 'inMatch'),
    );
    const broadcastsBefore = display.states.length;

    // Seat 1 holds the turn, so this is Bob playing out of turn.
    const ack = await bob.socket.emitWithAck('playCard', {
      cardId: bobsHand[0]?.id ?? '',
      targetSeatId: alice.seatId,
    });

    expect(ack).toEqual({ ok: false, reason: 'not your turn' });
    // A rejection is the ack and nothing else. Rather than wait a fixed moment
    // for a broadcast that shouldn't come, let the next legal play through: the
    // very next state the display sees has to be that one.
    await alice.socket.emitWithAck('playCard', {
      cardId: alicesHand[0]?.id ?? '',
      targetSeatId: bob.seatId,
    });
    const next = await waitFor("Alice's play to land", () =>
      display.states.length > broadcastsBefore
        ? display.states.at(-1)
        : undefined,
    );
    expect(display.states.length).toBe(broadcastsBefore + 1);
    expect(next.lastPlayed?.bySeatId).toBe(alice.seatId);
    expect(bob.hands.at(-1)).toEqual(bobsHand);
  });

  it('restores the same seat and hand when a token reconnects inside the timeout', async () => {
    const server = await startServer();
    const [alice, bob] = await server.seatPlayers('Alice', 'Bob');
    await alice.socket.emitWithAck('start');
    const bobsHand = await dealtHand(bob);

    await bob.drop(alice);
    server.tick(DISCONNECT_TIMEOUT_MS - 1_000);
    const reconnected = await server.client();
    const ack = await reconnected.socket.emitWithAck('join', {
      roomCode: ROOM_CODE,
      // A reconnect carries the token; the name it sends is ignored.
      name: 'Someone Else',
      token: bob.token,
    });

    expect(ack).toEqual({ ok: true, seatId: bob.seatId, token: bob.token });
    const restored = await waitFor(
      'the reclaimed seat to get its hand back',
      () => reconnected.hands.at(-1),
    );
    expect(restored).toEqual(bobsHand);
    const state = await waitFor('a broadcast after the reconnect', () =>
      reconnected.states.at(-1),
    );
    expect(state.seats[1]).toMatchObject({ name: 'Bob', eliminated: false });
  });

  it('eliminates a seat that stays disconnected past the timeout', async () => {
    const server = await startServer();
    const display = await server.client();
    const [alice, bob] = await server.seatPlayers('Alice', 'Bob', 'Carol');
    await alice.socket.emitWithAck('start');
    await waitFor('the match to start', () =>
      display.states.find((state) => state.phase === 'inMatch'),
    );

    await bob.drop(display);

    // Spec: a disconnect is invisible on the wire until it resolves either way.
    expect(display.states.at(-1)?.seats[1]).toMatchObject({
      name: 'Bob',
      eliminated: false,
    });

    server.tick(DISCONNECT_TIMEOUT_MS);
    const eliminated = await waitFor('Bob to be eliminated', () =>
      display.states.find((state) => state.seats[1]?.eliminated === true),
    );

    expect(eliminated.eliminationOrder).toEqual([bob.seatId]);
    expect(eliminated.seats[1]).toMatchObject({ name: 'Bob', handCount: 0 });
    // Two seats are still standing, so the match carries on.
    expect(eliminated.phase).toBe('inMatch');
    expect(eliminated.matchResult).toBeNull();
  });

  it('gates the display on the room code without seating it', async () => {
    const server = await startServer();
    const display = await server.client();
    await server.seatPlayers('Alice');

    const rejected = await display.socket.emitWithAck('joinAsDisplay', {
      roomCode: 'WRNG',
    });
    const accepted = await display.socket.emitWithAck('joinAsDisplay', {
      roomCode: ROOM_CODE,
    });

    expect(rejected).toEqual({ ok: false, reason: 'wrong room code' });
    expect(accepted).toEqual({ ok: true });
    const state = await waitFor('the display to see the table', () =>
      display.states.find((seen) => seen.seats[0]?.name === 'Alice'),
    );
    // The display watches; it never takes a seat and never gets a hand.
    expect(state.seats.filter((seat) => seat.name !== null)).toHaveLength(1);
    expect(display.hands).toEqual([]);
  });

  it('refuses a second seat to a socket that already holds one', async () => {
    const server = await startServer();
    const display = await server.client();
    const [alice] = await server.seatPlayers('Alice');

    // A double-tapped Join button, or a client that lost its token. A second
    // seat on the same socket could never be played: every action resolves
    // through the socket, so nothing would ever act for it.
    const second = await alice.socket.emitWithAck('join', {
      roomCode: ROOM_CODE,
      name: 'Alice Again',
    });

    expect(second).toEqual({ ok: false, reason: 'you already hold a seat' });
    const state = await waitFor('the display to see the table', () =>
      display.states.find((seen) => seen.seats[0]?.name === 'Alice'),
    );
    expect(state.seats.filter((seat) => seat.name !== null)).toHaveLength(1);
  });

  it('carries a match through to a winner and reopens the table on newMatch', async () => {
    // Bob drops right after seating — his turns auto-pass straight back to
    // Alice (spec.md's reconnect/idle-timeout), so one socket can drive every
    // turn of the match without a second live client acting in lockstep.
    // 4 + 4 + 3 = 11, enough from full HP; a single card can't do it alone.
    const server = await startServer({
      table: {
        shuffleDeck: deckOrderedBy(['immolate', 'immolate', 'flame_lash']),
      },
    });
    const display = await server.client();
    const [alice, bob] = await server.seatPlayers('Alice', 'Bob'); // red, green
    await alice.socket.emitWithAck('start');
    await bob.drop(alice);

    for (const defId of ['immolate', 'immolate', 'flame_lash']) {
      // Search only the *latest* hand — `alice.hands` accumulates every past
      // broadcast, and an earlier snapshot can still contain a card already
      // played and discarded since.
      const card = await waitFor(`${defId} to be in the current hand`, () =>
        alice.hands.at(-1)?.find((c) => c.defId === defId),
      );
      const ack = await alice.socket.emitWithAck('playCard', {
        cardId: card.id,
        targetSeatId: bob.seatId,
      });
      expect(ack).toEqual({ ok: true });
    }

    const over = await waitFor('the match to end', () =>
      display.states.find((state) => state.phase === 'matchOver'),
    );
    expect(over.matchResult).toEqual({ winnerSeatId: alice.seatId });
    expect(over.eliminationOrder).toEqual([bob.seatId]);
    expect(over.turnSeatId).toBeNull();

    // Bob reconnects (still inside the 60s window) to prove the loser's
    // socket gets dealt back in too, not just the winner's.
    const bobRejoined = await server.client();
    const rejoinAck = await bobRejoined.socket.emitWithAck('join', {
      roomCode: ROOM_CODE,
      name: 'Bob',
      token: bob.token,
    });
    expect(rejoinAck).toEqual({
      ok: true,
      seatId: bob.seatId,
      token: bob.token,
    });

    const ack = await alice.socket.emitWithAck('newMatch');

    expect(ack).toEqual({ ok: true });
    const restarted = await waitFor('the table to restart', () =>
      display.states.find(
        (state) => state.phase === 'inMatch' && state.matchResult === null,
      ),
    );
    expect(restarted.seats.slice(0, 2)).toMatchObject([
      { name: 'Alice', hp: 10, eliminated: false, handCount: 3, deckId: 'red' },
      { name: 'Bob', hp: 10, eliminated: false, handCount: 3, deckId: 'green' },
    ]);
    expect(restarted.eliminationOrder).toEqual([]);
    // Both seats are dealt in again, the loser's socket included.
    await dealtHand(bobRejoined);
  });

  it('survives payloads the wire contract forbids', async () => {
    const server = await startServer();
    const display = await server.client();
    const alice = await server.client();
    /** A view of the socket that can send what the contract forbids — any LAN
     *  client can, so the server has to hold up under it. */
    const rogue = alice.socket as unknown as Socket;

    // Actions with no ack at all, and actions carrying junk where the contract
    // promises an object of strings.
    rogue.emit('start');
    rogue.emit('newMatch');
    rogue.emit('playCard', 'nonsense');
    const badName = await new Promise((resolve) =>
      rogue.emit('join', { roomCode: ROOM_CODE, name: 42 }, resolve),
    );
    const badCard = await new Promise((resolve) =>
      rogue.emit('playCard', null, resolve),
    );

    expect(badName).toEqual({ ok: false, reason: 'malformed request' });
    expect(badCard).toEqual({ ok: false, reason: 'malformed request' });
    // Still up, still serving well-formed traffic.
    const ack = await alice.socket.emitWithAck('join', {
      roomCode: ROOM_CODE,
      name: 'Alice',
    });
    expect(ack).toMatchObject({ ok: true, seatId: 'seat-1' });
    await waitFor('the display to see Alice seated', () =>
      display.states.find((state) => state.seats[0]?.name === 'Alice'),
    );
  });

  it('answers the ack even when the table throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = await startServer({
      wrapTable: (table) => ({
        ...table,
        start() {
          throw new Error('boom');
        },
      }),
    });
    const [alice] = await server.seatPlayers('Alice', 'Bob');

    const ack = await alice.socket.emitWithAck('start');

    // Spec: every action is acked. A client left waiting on a reply that never
    // comes is the one outcome the contract rules out.
    expect(ack).toEqual({ ok: false, reason: 'server error' });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
