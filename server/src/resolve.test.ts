import { describe, expect, it } from 'vitest';
import type { CardEffect, HandCard } from '@card-game/shared';
import {
  autoTarget,
  type CombatSeat,
  MAX_SHIELDS,
  needsTarget,
  resolveCard,
  STARTING_HP,
  validatePlay,
} from './resolve';

function seat(over: Partial<CombatSeat> & { seatId: string }): CombatSeat {
  return {
    hp: STARTING_HP,
    shields: 0,
    eliminated: false,
    hand: [],
    drawPile: [],
    discard: [],
    ...over,
  };
}

/** `resolveCard` only reads `effects` — the rest of `HandCard` is irrelevant
 *  to resolution, so a minimal stub stands in for a real dealt card. */
function card(effects: CardEffect[]): HandCard {
  return {
    id: 'x',
    defId: 'x',
    name: 'X',
    effects,
    playAgain: false,
    needsTarget: needsTarget(effects),
  };
}

const noDraw = () => {
  throw new Error('unexpected draw');
};

describe('damage: shield absorb and carry-through', () => {
  it('absorbs what it can and reduces HP by the rest', () => {
    const attacker = seat({ seatId: 'a' });
    const target = seat({ seatId: 'b', shields: 2 });

    const events = resolveCard(
      card([{ kind: 'attack', value: 5, target: 'single' }]),
      'a',
      'b',
      [attacker, target],
      noDraw,
    );

    expect(target.shields).toBe(0);
    expect(target.hp).toBe(7); // 5 - 2 absorbed = 3 through
    expect(events).toEqual([
      { kind: 'damage', seatId: 'b', amount: 3, absorbed: 2 },
    ]);
  });

  it('absorbs the hit fully when shields cover it, HP untouched', () => {
    const attacker = seat({ seatId: 'a' });
    const target = seat({ seatId: 'b', shields: 4 });

    resolveCard(
      card([{ kind: 'attack', value: 2, target: 'single' }]),
      'a',
      'b',
      [attacker, target],
      noDraw,
    );

    expect(target.shields).toBe(2);
    expect(target.hp).toBe(STARTING_HP);
  });

  it('eliminates a seat that reaches 0 HP, once', () => {
    const attacker = seat({ seatId: 'a' });
    const target = seat({ seatId: 'b', hp: 3 });

    const events = resolveCard(
      card([{ kind: 'attack', value: 5, target: 'single' }]),
      'a',
      'b',
      [attacker, target],
      noDraw,
    );

    expect(target.eliminated).toBe(true);
    expect(target.hp).toBe(0);
    expect(events).toContainEqual({ kind: 'eliminated', seatId: 'b' });
  });
});

describe('strip', () => {
  it('floors at 0 rather than going negative', () => {
    const attacker = seat({ seatId: 'a' });
    const target = seat({ seatId: 'b', shields: 1 });

    const events = resolveCard(
      card([{ kind: 'strip', value: 3, target: 'single' }]),
      'a',
      'b',
      [attacker, target],
      noDraw,
    );

    expect(target.shields).toBe(0);
    expect(events).toEqual([{ kind: 'strip', seatId: 'b', amount: 1 }]);
  });
});

describe('shield', () => {
  it('caps at MAX_SHIELDS', () => {
    const actor = seat({ seatId: 'a', shields: 3 });

    const events = resolveCard(
      card([{ kind: 'shield', value: 3, target: 'single' }]),
      'a',
      null,
      [actor],
      noDraw,
    );

    expect(actor.shields).toBe(MAX_SHIELDS);
    expect(events).toEqual([{ kind: 'shield', seatId: 'a', amount: 1 }]);
  });
});

describe('heal', () => {
  it('caps at STARTING_HP, no overheal', () => {
    const actor = seat({ seatId: 'a', hp: 9 });

    const events = resolveCard(
      card([{ kind: 'heal', value: 5, target: 'single' }]),
      'a',
      null,
      [actor],
      noDraw,
    );

    expect(actor.hp).toBe(STARTING_HP);
    expect(events).toEqual([{ kind: 'heal', seatId: 'a', amount: 1 }]);
  });
});

describe('all-target effects', () => {
  it('hits every living opponent, skipping the actor and the eliminated', () => {
    const actor = seat({ seatId: 'a' });
    const alive = seat({ seatId: 'b' });
    const dead = seat({ seatId: 'c', eliminated: true, hp: 0 });

    resolveCard(
      card([{ kind: 'attack', value: 2, target: 'all' }]),
      'a',
      null,
      [actor, alive, dead],
      noDraw,
    );

    expect(actor.hp).toBe(STARTING_HP);
    expect(alive.hp).toBe(STARTING_HP - 2);
    expect(dead.hp).toBe(0);
  });
});

describe('draw', () => {
  it('calls the injected hook once per point of draw', () => {
    const actor = seat({ seatId: 'a' });
    let calls = 0;

    const events = resolveCard(
      card([{ kind: 'draw', value: 2, target: 'single' }]),
      'a',
      null,
      [actor],
      () => {
        calls++;
      },
    );

    expect(calls).toBe(2);
    expect(events).toEqual([{ kind: 'draw', seatId: 'a', amount: 2 }]);
  });
});

describe('combined effects', () => {
  it('applies every effect on the card, in order', () => {
    const actor = seat({ seatId: 'a', hp: 5 });
    const target = seat({ seatId: 'b' });

    resolveCard(
      card([
        { kind: 'attack', value: 1, target: 'single' },
        { kind: 'heal', value: 1, target: 'single' },
      ]),
      'a',
      'b',
      [actor, target],
      noDraw,
    );

    expect(target.hp).toBe(STARTING_HP - 1);
    expect(actor.hp).toBe(6);
  });
});

describe('needsTarget', () => {
  it('is true for a single-target attack or strip', () => {
    expect(needsTarget([{ kind: 'attack', value: 1, target: 'single' }])).toBe(
      true,
    );
    expect(needsTarget([{ kind: 'strip', value: 1, target: 'single' }])).toBe(
      true,
    );
  });

  it('is false for an all-target attack, and for shield/heal/draw', () => {
    expect(needsTarget([{ kind: 'attack', value: 1, target: 'all' }])).toBe(
      false,
    );
    expect(needsTarget([{ kind: 'shield', value: 1, target: 'single' }])).toBe(
      false,
    );
    expect(needsTarget([{ kind: 'heal', value: 1, target: 'single' }])).toBe(
      false,
    );
    expect(needsTarget([{ kind: 'draw', value: 1, target: 'single' }])).toBe(
      false,
    );
  });
});

describe('validatePlay', () => {
  const attack = card([{ kind: 'attack', value: 1, target: 'single' }]);
  const shieldCard = card([{ kind: 'shield', value: 1, target: 'single' }]);

  it('never rejects a card with no single-target effect', () => {
    const seats = [seat({ seatId: 'a' }), seat({ seatId: 'b' })];
    expect(validatePlay(shieldCard, null, seats, 'a')).toEqual({ ok: true });
  });

  it('auto-accepts a single-target card with exactly one living opponent', () => {
    const seats = [seat({ seatId: 'a' }), seat({ seatId: 'b' })];
    expect(validatePlay(attack, null, seats, 'a')).toEqual({ ok: true });
  });

  it('requires an explicit target with two or more living opponents', () => {
    const seats = [
      seat({ seatId: 'a' }),
      seat({ seatId: 'b' }),
      seat({ seatId: 'c' }),
    ];
    expect(validatePlay(attack, null, seats, 'a')).toEqual({
      ok: false,
      reason: 'target required',
    });
    expect(validatePlay(attack, 'b', seats, 'a')).toEqual({ ok: true });
  });

  it('rejects a self-target when there is a real choice to make', () => {
    // Two living opponents, so this isn't the auto-target branch — an
    // explicit target has to name one of them.
    const seats = [
      seat({ seatId: 'a' }),
      seat({ seatId: 'b' }),
      seat({ seatId: 'c' }),
    ];
    expect(validatePlay(attack, 'a', seats, 'a')).toEqual({
      ok: false,
      reason: 'invalid target',
    });
  });

  it('rejects targeting an eliminated seat when there is a real choice to make', () => {
    const seats = [
      seat({ seatId: 'a' }),
      seat({ seatId: 'b' }),
      seat({ seatId: 'c' }),
      seat({ seatId: 'd', eliminated: true }),
    ];
    expect(validatePlay(attack, 'd', seats, 'a')).toEqual({
      ok: false,
      reason: 'invalid target',
    });
  });
});

describe('autoTarget', () => {
  it('picks the sole living opponent', () => {
    const seats = [seat({ seatId: 'a' }), seat({ seatId: 'b' })];
    expect(autoTarget(seats, 'a')).toBe('b');
  });

  it('picks nobody with two or more living opponents', () => {
    const seats = [
      seat({ seatId: 'a' }),
      seat({ seatId: 'b' }),
      seat({ seatId: 'c' }),
    ];
    expect(autoTarget(seats, 'a')).toBeNull();
  });
});
