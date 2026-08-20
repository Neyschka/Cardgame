// The hand: a 2-column grid of square cards, a persistent action bar, and a
// full-screen target picker for single-target attacks/strips (spec.md's
// "Player client"). Selecting a card is local; every actual play goes to the
// server and this view only changes once the server says so.
//
// Layout is a fixed-height column: only the hand grid scrolls, so the HP
// readout and the Play button stay put on a short phone screen.

import { useState } from 'react';
import type { ActionResult, HandCard, PublicSeat } from '@card-game/shared';
import { effectPills } from './cards';
import {
  actionBar,
  colors,
  columnScreen,
  disabledButton,
  errorText,
  gutter,
  primaryButton,
  scrollRegion,
} from './styles';

export interface InMatchProps {
  mySeat: PublicSeat;
  hand: HandCard[];
  isYourTurn: boolean;
  /** Name of whoever is acting, shown when it isn't this player. */
  turnName: string | null;
  livingOpponents: PublicSeat[];
  error: string | null;
  onPlay: (cardId: string, targetSeatId?: string) => Promise<ActionResult>;
}

export function InMatch({
  mySeat,
  hand,
  isYourTurn,
  turnName,
  livingOpponents,
  error,
  onPlay,
}: InMatchProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targeting, setTargeting] = useState(false);
  const selected = hand.find((card) => card.id === selectedId) ?? null;

  async function play(targetSeatId?: string) {
    if (!selected) return;
    const result = await onPlay(selected.id, targetSeatId);
    // A rejected play keeps the selection: the reason shows in the action bar
    // area and the same card is still there to retry or swap out.
    if (!result.ok) return;
    setSelectedId(null);
    setTargeting(false);
  }

  // A single living opponent is auto-targeted server-side — no point asking.
  const needsPicker = (card: HandCard) =>
    card.needsTarget && livingOpponents.length > 1;

  return (
    <div style={{ ...columnScreen, position: 'relative' }}>
      <div style={{ padding: `${gutter} ${gutter} 8px`, textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(32px, 11vw, 44px)', fontWeight: 800 }}>
          {mySeat.hp}
        </div>
        <div style={{ fontSize: 12, color: colors.mutedText }}>
          HP{mySeat.shields > 0 && ` · ${'🛡️'.repeat(mySeat.shields)}`}
        </div>
        <div
          style={{
            marginTop: 8,
            display: 'inline-block',
            padding: '6px 14px',
            borderRadius: 999,
            background: isYourTurn ? colors.accent : '#333',
            color: isYourTurn ? '#1a1a1a' : '#aaa',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {isYourTurn ? 'Your turn' : `${turnName ?? 'Someone else'}'s turn`}
        </div>
      </div>

      <div
        style={{
          ...scrollRegion,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'clamp(8px, 2.5vw, 12px)',
          padding: gutter,
          alignContent: 'start',
          // Dimmed and inert off-turn, never hidden.
          opacity: isYourTurn ? 1 : 0.4,
        }}
      >
        {hand.map((card) => (
          <button
            key={card.id}
            disabled={!isYourTurn}
            onClick={() => setSelectedId(card.id)}
            style={{
              aspectRatio: '1 / 1',
              borderRadius: 10,
              padding: 4,
              background: colors.panel,
              border:
                selectedId === card.id
                  ? `3px solid ${colors.accent}`
                  : `1px solid ${colors.border}`,
              color: colors.text,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: isYourTurn ? 'pointer' : 'not-allowed',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 'clamp(12px, 3.6vw, 15px)',
                textAlign: 'center',
              }}
            >
              {card.name}
            </span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                justifyContent: 'center',
              }}
            >
              {effectPills(card).map((pill, index) => (
                <span
                  key={index}
                  style={{
                    fontSize: 'clamp(10px, 3vw, 12px)',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: pill.color,
                    color: '#1a1a1a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pill.icon} {pill.label}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      <div style={actionBar}>
        {error && <p style={{ ...errorText, marginBottom: 10 }}>{error}</p>}
        <button
          disabled={!selected || !isYourTurn}
          onClick={() =>
            selected && needsPicker(selected) ? setTargeting(true) : void play()
          }
          style={selected && isYourTurn ? primaryButton : disabledButton}
        >
          {selected ? `Play ${selected.name}` : 'Select a card'}
        </button>
      </div>

      {targeting && selected && needsPicker(selected) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: colors.background,
            display: 'flex',
            flexDirection: 'column',
            padding: gutter,
            paddingBottom: `calc(${gutter} + env(safe-area-inset-bottom))`,
          }}
        >
          <h3 style={{ textAlign: 'center', marginTop: 8 }}>
            Target for {selected.name}
          </h3>
          <div
            style={{
              ...scrollRegion,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 16,
            }}
          >
            {livingOpponents.map((opponent) => (
              <button
                key={opponent.seatId}
                onClick={() => void play(opponent.seatId)}
                style={primaryButton}
              >
                {opponent.name} ({opponent.hp} HP)
              </button>
            ))}
          </div>
          <button
            onClick={() => setTargeting(false)}
            style={{
              ...primaryButton,
              marginTop: 16,
              background: 'transparent',
              border: '1px solid #556',
              color: colors.text,
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
