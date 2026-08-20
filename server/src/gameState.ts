// The table's state machine, as a pure module: no socket.io import lives here.
// `index.ts` (task 03) owns the sockets, calls in, and broadcasts whatever comes
// back out. See `.scratch/card-game/spec.md` ("Module layout", "Public vs.
// internal state") for the split, and `docs/game-mechanics.md` for the rules
// this file encodes. Vocabulary follows `CONTEXT.md` — this is the Table; only
// the file path stays `gameState.ts`, because spec.md's module layout pins it.

import type {
  ActionResult,
  DeckId,
  HandCard,
  JoinResult,
  LastPlayed,
  MatchResult,
  PublicSeat,
  PublicTableState,
} from '@card-game/shared';
import { buildDeck, DECKS, type CardDef } from './cards';
import {
  autoTarget,
  HAND_SIZE,
  MAX_CHAIN,
  needsTarget,
  resolveCard,
  STARTING_HP,
  validatePlay,
} from './resolve';

const SEAT_COUNT = 4;
const MIN_PLAYERS = 2;
const DECK_IDS: DeckId[] = ['red', 'green', 'blue', 'yellow'];

/** Every card definition, keyed by id, across all four decks — the lookup a
 *  drawn defId goes through to become a dealt `HandCard`. */
const CARD_BY_ID = new Map<string, CardDef>();
for (const deck of Object.values(DECKS)) {
  for (const def of deck) CARD_BY_ID.set(def.id, def);
}

/** A disconnected seat is eliminated (mid-match) or reopened (between matches)
 *  once it has been gone this long — spec.md's "Reconnect & idle-timeout". */
export const DISCONNECT_TIMEOUT_MS = 60_000;

/** Internal seat — richer than `PublicSeat`. Deck, discard, token, socket id and
 *  disconnect timestamp never cross the wire. `drawPile`/`discard` hold card
 *  *definition* ids; `hand` holds fully-formed `HandCard`s, matching the wire
 *  shape so `handFor` is a plain copy. */
interface Seat {
  seatId: string;
  name: string | null;
  deckId: DeckId | null;
  isHost: boolean;
  hp: number;
  shields: number;
  eliminated: boolean;
  hand: HandCard[];
  drawPile: string[];
  discard: string[];
  token: string | null;
  socketId: string | null;
  disconnectedAt: number | null;
}

export interface TableOptions {
  roomCode: string;
  lanAddress: string;
  /** Injectable clock; only the disconnect timeout reads it. */
  now?: () => number;
  /** Injectable RNG, used to mint reconnect tokens, assign decks and drive the
   *  shuffles. */
  random?: () => number;
  /** Deck-order seam — tests inject a fixed order for deterministic hands. */
  shuffleDeck?: (cards: string[]) => string[];
  /** Turn-order seam — same reason. */
  shuffleTurnOrder?: (seatIds: string[]) => string[];
}

export interface Table {
  join(input: {
    socketId: string;
    roomCode: string;
    name: string;
    token?: string;
  }): JoinResult;
  joinAsDisplay(input: { roomCode: string }): ActionResult;
  start(input: { socketId: string }): ActionResult;
  playCard(input: {
    socketId: string;
    cardId: string;
    targetSeatId?: string;
  }): ActionResult;
  newMatch(input: { socketId: string }): ActionResult;
  /** A socket dropped. Ends its turn if it was on one; starts the 60s clock. */
  disconnect(socketId: string): void;
  /** Applies the 60s rule to every disconnected seat. Returns the seat ids it
   *  changed, so the wiring knows whether a re-broadcast is due. */
  expireDisconnected(): string[];
  /** The projection onto the wire shape. Viewer-independent by design: hand
   *  contents are never in here for *any* viewer — they come from `handFor`. */
  publicState(): PublicTableState;
  handFor(seatId: string): HandCard[];
  seatIdForSocket(socketId: string): string | null;
  seatedSockets(): { socketId: string; seatId: string }[];
}

export function createTable(options: TableOptions): Table {
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? Math.random;
  const shuffleDeck = options.shuffleDeck ?? makeShuffle<string>(random);
  const shuffleTurnOrder =
    options.shuffleTurnOrder ?? makeShuffle<string>(random);

  let nextCardId = 0;

  const state = {
    phase: 'lobby' as PublicTableState['phase'],
    seats: buildSeats(),
    turnOrder: [] as string[],
    turnSeatId: null as string | null,
    chainCount: 0,
    lastPlayed: null as LastPlayed,
    eliminationOrder: [] as string[],
    matchResult: null as MatchResult | null,
  };

  // --- lookups ------------------------------------------------------------

  const seatById = (seatId: string) =>
    state.seats.find((seat) => seat.seatId === seatId);

  const seatBySocket = (socketId: string) =>
    state.seats.find((seat) => seat.socketId === socketId);

  const isOccupied = (seat: Seat) => seat.name !== null;
  const isLiving = (seat: Seat) => isOccupied(seat) && !seat.eliminated;
  const livingSeats = () => state.seats.filter(isLiving);

  /** `resolve.ts`'s `living()` only knows `eliminated`, not "unclaimed" — an
   *  open seat defaults to `eliminated: false`, so passing all four raw seats
   *  in a 2- or 3-player match would count phantom empty ones as opponents.
   *  This is the view combat resolution actually gets. */
  const combatSeats = () => state.seats.filter(isOccupied);

  /** Held by nobody and past its 60s window — safe to eliminate or reopen. A
   *  seat inside the window still counts as its player's: a phone refresh must
   *  not cost them the seat, whatever else the table does meanwhile. */
  const isAbandoned = (seat: Seat) =>
    isOccupied(seat) &&
    seat.disconnectedAt !== null &&
    now() - seat.disconnectedAt >= DISCONNECT_TIMEOUT_MS;

  // --- seat lifecycle -----------------------------------------------------

  function bind(seat: Seat, socketId: string) {
    seat.socketId = socketId;
    seat.disconnectedAt = null;
  }

  function clearCards(seat: Seat) {
    seat.hand = [];
    seat.drawPile = [];
    seat.discard = [];
  }

  /** Everything about a seat's play, minus who is sitting in it and which deck
   *  they were dealt — that's a join-time assignment, not a per-match reset. */
  function resetPlay(seat: Seat) {
    seat.hp = STARTING_HP;
    seat.shields = 0;
    seat.eliminated = false;
    clearCards(seat);
  }

  /** Wipes a seat back to an open slot. Its cards, token, deck and host flag go
   *  too — the freed deck becomes available to the next joiner. */
  function vacate(seat: Seat) {
    seat.name = null;
    seat.isHost = false;
    seat.token = null;
    seat.socketId = null;
    seat.disconnectedAt = null;
    seat.deckId = null;
    resetPlay(seat);
  }

  /** Host is tied to a seat, not re-derived per match — but if that seat is
   *  vacated the role has to move, or nobody can ever start a match again. */
  function reassignHost() {
    const occupied = state.seats.filter(isOccupied);
    if (occupied.length === 0 || occupied.some((seat) => seat.isHost)) return;
    const [first] = occupied;
    if (first) first.isHost = true;
  }

  /** The seat a fresh join lands in: the first open slot, or — between matches —
   *  an abandoned one (spec.md's rematch seat reopening). */
  function claimableSeat(): Seat | undefined {
    const open = state.seats.find((seat) => !isOccupied(seat));
    if (open) return open;
    if (state.phase !== 'matchOver') return undefined;
    const abandoned = state.seats.find(isAbandoned);
    if (!abandoned) return undefined;
    vacate(abandoned);
    return abandoned;
  }

  /** One of the four class decks, picked uniformly from whichever aren't
   *  already held by an occupied seat. With `SEAT_COUNT === DECK_IDS.length`
   *  there is always exactly one free deck for a seat that can still be
   *  claimed. No deck-select UI — this is the only place a deck is chosen. */
  function randomDeckId(): DeckId {
    const held = new Set(
      state.seats
        .filter((seat) => isOccupied(seat) && seat.deckId !== null)
        .map((seat) => seat.deckId),
    );
    const available = DECK_IDS.filter((id) => !held.has(id));
    return available[Math.floor(random() * available.length)]!;
  }

  /** Seat-scoped so two seats can never end up holding the same token, however
   *  poor the injected RNG is. The seat id is public in `tableState` anyway.
   *
   *  Note on lifetime: spec.md says a token is "invalidated once the match ends
   *  or a new match starts", but the wire contract has no way to hand a rotated
   *  token to an already-connected client (only the `join` ack carries one), so
   *  rotating one would break every post-match reconnect. A token instead dies
   *  with the seat it belongs to — cleared in `vacate`. */
  function mintToken(seatId: string) {
    const secret = Array.from({ length: 4 }, () =>
      Math.floor(random() * 0x10000)
        .toString(16)
        .padStart(4, '0'),
    ).join('');
    return `${seatId}-${secret}`;
  }

  /** Both start and newMatch are host-only actions from a seated socket. */
  function requireHost(socketId: string, action: string): ActionResult {
    const seat = seatBySocket(socketId);
    if (!seat) return { ok: false, reason: 'you are not seated' };
    if (!seat.isHost)
      return { ok: false, reason: `only the host can ${action}` };
    return { ok: true };
  }

  // --- cards --------------------------------------------------------------

  function toHandCard(defId: string): HandCard {
    const def = CARD_BY_ID.get(defId);
    if (!def) throw new Error(`unknown card def ${defId}`);
    return {
      id: `c${nextCardId++}`,
      defId: def.id,
      name: def.name,
      effects: def.effects,
      playAgain: !!def.playAgain,
      needsTarget: needsTarget(def.effects),
    };
  }

  /** Draws exactly one card, reshuffling the discard into a fresh draw pile if
   *  the seat's is empty. A no-op once both piles are empty. Also handed to
   *  `resolveCard` as its `drawCard` seam, so a `draw` effect's own loop calls
   *  this once per point of draw. */
  function drawOne(seat: Pick<Seat, 'hand' | 'drawPile' | 'discard'>) {
    if (seat.drawPile.length === 0) {
      if (seat.discard.length === 0) return;
      seat.drawPile = shuffleDeck(seat.discard);
      seat.discard = [];
    }
    const defId = seat.drawPile.shift();
    if (!defId) return;
    seat.hand.push(toHandCard(defId));
  }

  function drawUpTo(seat: Seat, size: number) {
    while (seat.hand.length < size) {
      const before = seat.hand.length;
      drawOne(seat);
      if (seat.hand.length === before) return;
    }
  }

  // --- turns --------------------------------------------------------------

  function nextLivingSeatId(fromSeatId: string): string | null {
    const { turnOrder } = state;
    if (turnOrder.length === 0) return null;
    const from = Math.max(turnOrder.indexOf(fromSeatId), 0);
    for (let step = 1; step <= turnOrder.length; step++) {
      const candidate = turnOrder[(from + step) % turnOrder.length];
      const seat = candidate === undefined ? undefined : seatById(candidate);
      if (seat && isLiving(seat)) return seat.seatId;
    }
    return null;
  }

  /** Hands the turn to a seat, auto-passing straight through disconnected seats
   *  — an instant "no legal plays" turn, draw step included (spec.md's
   *  "Reconnect & idle-timeout"). Bounded by one lap: if every living seat is
   *  disconnected the turn parks until the 60s timeouts resolve the match.
   *  Shields no longer expire here — they persist until stripped or spent. */
  function enterTurn(seatId: string) {
    let current: string | null = seatId;
    for (let hop = 0; hop < state.turnOrder.length && current !== null; hop++) {
      const seat = seatById(current);
      if (!seat) return;
      state.turnSeatId = seat.seatId;
      if (seat.socketId !== null) return;
      drawUpTo(seat, HAND_SIZE);
      const next = nextLivingSeatId(seat.seatId);
      current = next === seat.seatId ? null : next;
    }
  }

  function endTurn(seat: Seat) {
    state.chainCount = 0;
    drawUpTo(seat, HAND_SIZE);
    const next = nextLivingSeatId(seat.seatId);
    if (next === null) {
      state.turnSeatId = null;
      return;
    }
    enterTurn(next);
  }

  // --- elimination & match end -------------------------------------------

  /** Finishes a seat's elimination: `eliminated` may already be true (damage
   *  resolution sets it as part of applying a hit) — this is what only
   *  `gameState.ts` owns, cards/discard/token concerns aside. Deck, hand and
   *  discard leave play; the seat is skipped from now on. */
  function eliminate(seat: Seat) {
    seat.eliminated = true;
    seat.shields = 0;
    clearCards(seat);
    state.eliminationOrder.push(seat.seatId);
  }

  function resolveMatchEnd(): boolean {
    if (state.phase !== 'inMatch') return false;
    const alive = livingSeats();
    if (alive.length > 1) return false;
    const [survivor] = alive;
    state.phase = 'matchOver';
    state.turnSeatId = null;
    state.matchResult = survivor
      ? { winnerSeatId: survivor.seatId }
      : { draw: true };
    return true;
  }

  function beginMatch(): ActionResult {
    const participants = state.seats.filter(
      (seat) => isOccupied(seat) && !isAbandoned(seat),
    );
    if (participants.length < MIN_PLAYERS) {
      return { ok: false, reason: `need at least ${MIN_PLAYERS} players` };
    }
    // Abandoned slots reopen for new players at rematch time. A seat still
    // inside its 60s window keeps its player and is dealt in as normal — turn
    // rotation auto-passes it until they reconnect.
    for (const seat of state.seats) {
      if (isAbandoned(seat)) vacate(seat);
    }
    reassignHost();
    for (const seat of participants) {
      resetPlay(seat);
      // Assigned at join, never reassigned mid-table — a rematch keeps every
      // still-seated player's class; only a freshly (re)joined seat got a new
      // one from `randomDeckId`.
      const deckId = seat.deckId!;
      seat.drawPile = shuffleDeck(buildDeck(DECKS[deckId]));
      drawUpTo(seat, HAND_SIZE);
    }
    state.phase = 'inMatch';
    state.lastPlayed = null;
    state.eliminationOrder = [];
    state.matchResult = null;
    state.chainCount = 0;
    state.turnOrder = shuffleTurnOrder(participants.map((seat) => seat.seatId));
    const [first] = state.turnOrder;
    if (first) enterTurn(first);
    return { ok: true };
  }

  // --- projections --------------------------------------------------------

  const toPublicSeat = (seat: Seat): PublicSeat => ({
    seatId: seat.seatId,
    name: seat.name,
    deckId: seat.deckId,
    isHost: seat.isHost,
    hp: seat.hp,
    shields: seat.shields,
    eliminated: seat.eliminated,
    handCount: seat.hand.length,
  });

  return {
    join({ socketId, roomCode, name, token }) {
      if (roomCode !== options.roomCode) {
        return { ok: false, reason: 'wrong room code' };
      }
      if (token) {
        const claimed = state.seats.find(
          (seat) => seat.token === token && isOccupied(seat),
        );
        if (claimed) {
          // Reclaim: the supplied name is ignored, the seat keeps its own —
          // and its deck, since only `vacate` ever clears `deckId`.
          bind(claimed, socketId);
          return { ok: true, seatId: claimed.seatId, token };
        }
        // A stale token (its seat was reopened) falls through to a fresh claim.
      }
      if (state.phase === 'inMatch') {
        return { ok: false, reason: 'match already in progress' };
      }
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, reason: 'name required' };
      const seat = claimableSeat();
      if (!seat) return { ok: false, reason: 'table full' };
      seat.name = trimmed;
      seat.deckId = randomDeckId();
      seat.token = mintToken(seat.seatId);
      bind(seat, socketId);
      reassignHost();
      return { ok: true, seatId: seat.seatId, token: seat.token };
    },

    joinAsDisplay({ roomCode }) {
      if (roomCode !== options.roomCode) {
        return { ok: false, reason: 'wrong room code' };
      }
      return { ok: true };
    },

    start({ socketId }) {
      const gate = requireHost(socketId, 'start the match');
      if (!gate.ok) return gate;
      if (state.phase === 'inMatch') {
        return { ok: false, reason: 'match already in progress' };
      }
      if (state.phase === 'matchOver') {
        return { ok: false, reason: 'the match is over — start a new match' };
      }
      return beginMatch();
    },

    newMatch({ socketId }) {
      const gate = requireHost(socketId, 'start a new match');
      if (!gate.ok) return gate;
      if (state.phase !== 'matchOver') {
        return { ok: false, reason: 'no finished match to restart' };
      }
      return beginMatch();
    },

    playCard({ socketId, cardId, targetSeatId }) {
      if (state.phase !== 'inMatch') {
        return { ok: false, reason: 'no match in progress' };
      }
      const seat = seatBySocket(socketId);
      if (!seat) return { ok: false, reason: 'you are not seated' };
      if (seat.eliminated) return { ok: false, reason: 'you are eliminated' };
      if (state.turnSeatId !== seat.seatId) {
        return { ok: false, reason: 'not your turn' };
      }
      const card = seat.hand.find((c) => c.id === cardId);
      if (!card) return { ok: false, reason: 'card not in hand' };

      const seats = combatSeats();
      const targetId = targetSeatId ?? autoTarget(seats, seat.seatId);
      const validation = validatePlay(card, targetId, seats, seat.seatId);
      if (!validation.ok) return validation;

      seat.hand.splice(seat.hand.indexOf(card), 1);
      seat.discard.push(card.defId);

      const events = resolveCard(card, seat.seatId, targetId, seats, drawOne);
      for (const event of events) {
        if (event.kind !== 'eliminated') continue;
        const victim = seatById(event.seatId);
        if (victim) eliminate(victim);
      }

      state.lastPlayed = {
        defId: card.defId,
        name: card.name,
        effects: card.effects,
        bySeatId: seat.seatId,
        targetSeatId: targetId,
      };

      if (resolveMatchEnd()) return { ok: true };

      // Every card is legal, and exactly one is played per turn — the only
      // way the same seat keeps going is a `playAgain` card under the cap.
      if (card.playAgain && state.chainCount < MAX_CHAIN) {
        state.chainCount++;
      } else {
        endTurn(seat);
      }
      return { ok: true };
    },

    disconnect(socketId) {
      const seat = seatBySocket(socketId);
      if (!seat) return;
      seat.socketId = null;
      seat.disconnectedAt = now();
      if (
        state.phase === 'inMatch' &&
        state.turnSeatId === seat.seatId &&
        !seat.eliminated
      ) {
        // Dropping mid-turn ends that turn, draw step included.
        endTurn(seat);
      }
    },

    expireDisconnected() {
      const changed: string[] = [];
      for (const seat of state.seats) {
        if (!isAbandoned(seat)) continue;
        if (state.phase === 'inMatch') {
          if (seat.eliminated) continue;
          eliminate(seat);
        } else {
          // Between matches there is no match to be eliminated from — the slot
          // reopens instead, so the table can't be deadlocked by a seat (or a
          // host) that never comes back.
          vacate(seat);
        }
        changed.push(seat.seatId);
      }
      if (changed.length === 0) return changed;
      reassignHost();
      if (state.phase === 'inMatch' && !resolveMatchEnd()) {
        const current =
          state.turnSeatId === null ? undefined : seatById(state.turnSeatId);
        if (!current || current.eliminated) {
          const next = nextLivingSeatId(state.turnSeatId ?? '');
          state.chainCount = 0;
          if (next === null) state.turnSeatId = null;
          else enterTurn(next);
        }
      }
      return changed;
    },

    publicState() {
      return {
        roomCode: options.roomCode,
        lanAddress: options.lanAddress,
        phase: state.phase,
        seats: state.seats.map(toPublicSeat),
        turnSeatId: state.turnSeatId,
        chainCount: state.chainCount,
        lastPlayed: state.lastPlayed,
        eliminationOrder: [...state.eliminationOrder],
        matchResult: state.matchResult,
      };
    },

    handFor(seatId) {
      const seat = seatById(seatId);
      if (!seat) return [];
      return [...seat.hand];
    },

    seatIdForSocket(socketId) {
      return seatBySocket(socketId)?.seatId ?? null;
    },

    seatedSockets() {
      return state.seats.flatMap((seat) =>
        isOccupied(seat) && seat.socketId !== null
          ? [{ socketId: seat.socketId, seatId: seat.seatId }]
          : [],
      );
    },
  };
}

/** The four fixed slots. `PublicSeat.name === null` is how an open one reads on
 *  the wire, which is what drives the display's "N/4 joined". */
function buildSeats(): Seat[] {
  return Array.from({ length: SEAT_COUNT }, (_unused, index) => ({
    seatId: `seat-${index + 1}`,
    name: null,
    deckId: null,
    isHost: false,
    hp: STARTING_HP,
    shields: 0,
    eliminated: false,
    hand: [],
    drawPile: [],
    discard: [],
    token: null,
    socketId: null,
    disconnectedAt: null,
  }));
}

function makeShuffle<T>(random: () => number): (items: T[]) => T[] {
  return (items: T[]) => {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const swap = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = swap;
    }
    return shuffled;
  };
}
