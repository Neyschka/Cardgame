// How a hand card reads on screen. A card can combine more than one effect
// now (`server/src/cards.ts`'s combo cards), so there's no single type/value
// to label — each effect gets its own pill instead. Legality is gone from the
// rules (`docs/game-mechanics.md`), so unlike the old `illegalReason` there is
// nothing here to explain a dead card with.

import type { CardEffect, EffectKind } from '@card-game/shared';

/** The card generator's `ACTION_COLORS` — kept in sync by hand since the art
 *  pack and this renderer are separate outputs of the same source. `strip` is
 *  its own color (orange), not blue: a destroyed shield must not read as a
 *  gained one. */
export const ACTION_COLORS: Record<EffectKind, string> = {
  attack: '#f87171',
  shield: '#60a5fa',
  heal: '#f472b6',
  draw: '#a78bfa',
  strip: '#fb923c',
};

const EFFECT_ICON: Record<EffectKind, string> = {
  attack: '⚔️',
  shield: '🛡️',
  heal: '➕',
  draw: '🃏',
  strip: '🔻',
};

export interface EffectPill {
  kind: EffectKind;
  color: string;
  icon: string;
  label: string;
}

const pillLabel = (effect: CardEffect): string =>
  effect.target === 'all' ? `${effect.value} all` : `${effect.value}`;

/** One pill per effect, in the order the card defines them — the stack a hand
 *  card (or the display's `lastPlayed`) renders as now that a card can do
 *  more than one thing. Takes just the `effects` array, not a full
 *  `HandCard`, so the display client can reuse it for `lastPlayed` too. */
export const effectPills = (card: { effects: CardEffect[] }): EffectPill[] =>
  card.effects.map((effect) => ({
    kind: effect.kind,
    color: ACTION_COLORS[effect.kind],
    icon: EFFECT_ICON[effect.kind],
    label: pillLabel(effect),
  }));
