// Pure card resolution. No socket.io, no seat/token/lobby concerns —
// `gameState.ts` owns those and calls into here.

import type { CardEffect, HandCard } from '@card-game/shared';

export const STARTING_HP = 10;
export const HAND_SIZE = 3; // draw UP TO this; draw cards may exceed it
export const MAX_SHIELDS = 4; // board art has four shield slots per seat

export interface CombatSeat {
  seatId: string;
  hp: number;
  shields: number;
  eliminated: boolean;
  hand: HandCard[];
  drawPile: string[]; // card definition ids
  discard: string[];
}

// Emitted for the display client to animate. Order is resolution order.
export type ResolveEvent =
  | { kind: 'damage'; seatId: string; amount: number; absorbed: number }
  | { kind: 'shield'; seatId: string; amount: number }
  | { kind: 'heal'; seatId: string; amount: number }
  | { kind: 'strip'; seatId: string; amount: number }
  | { kind: 'draw'; seatId: string; amount: number }
  | { kind: 'eliminated'; seatId: string };

const living = (seats: CombatSeat[]) => seats.filter((s) => !s.eliminated);

function damage(seat: CombatSeat, amount: number, out: ResolveEvent[]): void {
  const absorbed = Math.min(seat.shields, amount);
  seat.shields -= absorbed;
  const through = amount - absorbed;
  seat.hp = Math.max(0, seat.hp - through);
  out.push({ kind: 'damage', seatId: seat.seatId, amount: through, absorbed });
  if (seat.hp === 0 && !seat.eliminated) {
    seat.eliminated = true;
    out.push({ kind: 'eliminated', seatId: seat.seatId });
  }
}

function applyEffect(
  effect: CardEffect,
  actor: CombatSeat,
  target: CombatSeat | null,
  seats: CombatSeat[],
  out: ResolveEvent[],
  drawCard: (seat: CombatSeat) => void,
): void {
  switch (effect.kind) {
    case 'attack': {
      const victims =
        effect.target === 'all'
          ? living(seats).filter((s) => s.seatId !== actor.seatId)
          : target
            ? [target]
            : [];
      for (const v of victims) damage(v, effect.value, out);
      break;
    }
    case 'strip': {
      const victims =
        effect.target === 'all'
          ? living(seats).filter((s) => s.seatId !== actor.seatId)
          : target
            ? [target]
            : [];
      for (const v of victims) {
        const removed = Math.min(v.shields, effect.value);
        v.shields -= removed;
        out.push({ kind: 'strip', seatId: v.seatId, amount: removed });
      }
      break;
    }
    case 'shield': {
      const before = actor.shields;
      actor.shields = Math.min(MAX_SHIELDS, actor.shields + effect.value);
      out.push({
        kind: 'shield',
        seatId: actor.seatId,
        amount: actor.shields - before,
      });
      break;
    }
    case 'heal': {
      const before = actor.hp;
      actor.hp = Math.min(STARTING_HP, actor.hp + effect.value);
      out.push({
        kind: 'heal',
        seatId: actor.seatId,
        amount: actor.hp - before,
      });
      break;
    }
    case 'draw': {
      for (let i = 0; i < effect.value; i++) drawCard(actor);
      out.push({ kind: 'draw', seatId: actor.seatId, amount: effect.value });
      break;
    }
  }
}

/**
 * Resolve one card. Mutates `seats`. Returns events in resolution order.
 * `drawCard` is injected so the caller owns shuffling/reshuffling.
 */
export function resolveCard(
  card: HandCard,
  actorId: string,
  targetId: string | null,
  seats: CombatSeat[],
  drawCard: (seat: CombatSeat) => void,
): ResolveEvent[] {
  const out: ResolveEvent[] = [];
  const actor = seats.find((s) => s.seatId === actorId);
  if (!actor) return out;
  const target = targetId
    ? (seats.find((s) => s.seatId === targetId) ?? null)
    : null;

  for (const effect of card.effects) {
    applyEffect(effect, actor, target, seats, out, drawCard);
  }
  return out;
}

/** True if the client must pick a target before this card can be played. */
export function needsTarget(effects: CardEffect[]): boolean {
  return effects.some(
    (e) => (e.kind === 'attack' || e.kind === 'strip') && e.target === 'single',
  );
}

/** Validate a play request before resolving. Every card is always legal. */
export function validatePlay(
  card: HandCard,
  targetId: string | null,
  seats: CombatSeat[],
  actorId: string,
): { ok: true } | { ok: false; reason: string } {
  const opponents = living(seats).filter((s) => s.seatId !== actorId);
  if (!needsTarget(card.effects)) return { ok: true };
  if (opponents.length === 1) return { ok: true }; // auto-target
  if (!targetId) return { ok: false, reason: 'target required' };
  const target = opponents.find((s) => s.seatId === targetId);
  if (!target) return { ok: false, reason: 'invalid target' };
  return { ok: true };
}

/** Sole surviving opponent, for auto-targeting. */
export function autoTarget(
  seats: CombatSeat[],
  actorId: string,
): string | null {
  const opponents = living(seats).filter((s) => s.seatId !== actorId);
  return opponents.length === 1 ? opponents[0].seatId : null;
}
