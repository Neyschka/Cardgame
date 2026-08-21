// The hand screen and its targeting screen (spec.md's "Player client"),
// following phone-screens.html's "3 · Hand" and "4 · Choose a target".
// Tapping a card plays it straight away, or — if it needs a target and more
// than one opponent is alive — goes straight to the targeting screen. There
// is no intermediate "selected" state and no confirm button: one tap on a
// card, at most one tap on a target, done.
//
// Layout is a fixed-height column: only the hand grid scrolls, so the status
// strip at the top stays put on a short phone screen.

import { useState } from 'react'
import type { ActionResult, HandCard, PublicSeat } from '@card-game/shared'
import { cardArtUrl } from '../assets/cardArt'
import { CLASS_COLORS } from '../deckTheme'
import { describeEffects, effectPills } from './cards'
import {
  colors,
  columnScreen,
  errorText,
  gutter,
  primaryButton,
  scrollRegion,
  tokens,
} from './styles'

export interface InMatchProps {
  mySeat: PublicSeat
  hand: HandCard[]
  isYourTurn: boolean
  /** Name of whoever is acting, shown when it isn't this player. */
  turnName: string | null
  /** Every other claimed seat, living or eliminated — the foes strip shows
   *  eliminated ones dimmed rather than dropping them. */
  opponents: PublicSeat[]
  error: string | null
  onPlay: (cardId: string, targetSeatId?: string) => Promise<ActionResult>
}

export function InMatch({
  mySeat,
  hand,
  isYourTurn,
  turnName,
  opponents,
  error,
  onPlay,
}: InMatchProps) {
  const [targetingCardId, setTargetingCardId] = useState<string | null>(null)
  const livingOpponents = opponents.filter((seat) => !seat.eliminated)
  const targetingCard = hand.find((card) => card.id === targetingCardId) ?? null
  const classColor = mySeat.deckId ? CLASS_COLORS[mySeat.deckId] : tokens.gold

  async function play(cardId: string, targetSeatId?: string) {
    const result = await onPlay(cardId, targetSeatId)
    if (result.ok) setTargetingCardId(null)
    return result
  }

  async function tapCard(card: HandCard) {
    if (!isYourTurn) return
    // A single living opponent is auto-targeted server-side — no point asking.
    if (card.needsTarget && livingOpponents.length > 1) {
      setTargetingCardId(card.id)
    } else {
      void play(card.id)
    }
  }

  if (targetingCard) {
    return (
      <TargetingScreen
        card={targetingCard}
        opponents={opponents}
        livingOpponents={livingOpponents}
        error={error}
        onPick={(seatId) => void play(targetingCard.id, seatId)}
        onCancel={() => setTargetingCardId(null)}
      />
    )
  }

  return (
    <div style={{ ...columnScreen, padding: gutter, boxSizing: 'border-box' }}>
      <FoeStrip opponents={opponents} />
      <TurnBanner isYourTurn={isYourTurn} turnName={turnName} />
      <SelfBar hp={mySeat.hp} shields={mySeat.shields} />
      {error && <p style={{ ...errorText, marginTop: 10 }}>{error}</p>}

      <div
        style={{
          ...scrollRegion,
          marginTop: 'auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'center',
          paddingTop: 12,
          opacity: isYourTurn ? 1 : 0.45,
        }}
      >
        {hand.map((card) => (
          <button
            key={card.id}
            disabled={!isYourTurn}
            onClick={() => void tapCard(card)}
            style={{
              flex: '1 1 100px',
              maxWidth: 160,
              aspectRatio: '264 / 374',
              borderRadius: 14,
              border: `3px solid ${classColor}`,
              background: `linear-gradient(${classColor}30, ${classColor}30), ${tokens.panel}`,
              padding: '10px 6px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              color: colors.text,
              cursor: isYourTurn ? 'pointer' : 'not-allowed',
            }}
          >
            <h4
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 13.5,
                fontWeight: 600,
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              {card.name}
            </h4>
            <img
              src={cardArtUrl(card.defId)}
              alt=""
              style={{
                flex: 1,
                minHeight: 0,
                margin: '8px 2px',
                borderRadius: 8,
                objectFit: 'cover',
                border: '1px solid rgba(201,162,39,0.45)',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {effectPills(card).map((pill, index) => (
                <span
                  key={index}
                  style={{
                    fontFamily: tokens.fontDisplay,
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    padding: '3px 5px',
                    background: tokens.inset,
                    color: pill.color,
                  }}
                >
                  {pill.icon} {pill.label}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function FoeStrip({ opponents }: { opponents: PublicSeat[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
      {opponents.map((seat) => {
        const color = seat.deckId ? CLASS_COLORS[seat.deckId] : tokens.gold
        return (
          <div
            key={seat.seatId}
            style={{
              flex: 1,
              borderRadius: 10,
              padding: '8px 4px',
              background: `linear-gradient(${color}29, ${color}29), ${tokens.panel}`,
              border: `2px solid ${color}`,
              fontSize: 13,
              textAlign: 'center',
              opacity: seat.eliminated ? 0.35 : 1,
              filter: seat.eliminated ? 'grayscale(1)' : undefined,
            }}
          >
            <b
              style={{
                display: 'block',
                fontFamily: tokens.fontDisplay,
                fontSize: 15,
              }}
            >
              {seat.name}
            </b>
            {seat.eliminated ? 'OUT' : `${seat.hp} ♥ · ${seat.shields} 🛡`}
          </div>
        )
      })}
    </div>
  )
}

function TurnBanner({
  isYourTurn,
  turnName,
}: {
  isYourTurn: boolean
  turnName: string | null
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 14,
        fontFamily: tokens.fontDisplay,
        fontWeight: 700,
        letterSpacing: 3,
        fontSize: 16,
        textAlign: 'center',
        margin: '8px 0',
        ...(isYourTurn
          ? {
              color: '#2a1a03',
              background: `linear-gradient(180deg, ${tokens.goldLt}, ${tokens.gold} 50%, ${tokens.goldDk})`,
              boxShadow: '0 0 16px rgba(240,217,138,0.3)',
            }
          : {
              color: colors.mutedText,
              background: colors.panel,
              border: '1.5px solid rgba(201,162,39,0.3)',
            }),
      }}
    >
      {isYourTurn
        ? 'YOUR TURN'
        : `${(turnName ?? 'SOMEONE ELSE').toUpperCase()}'S TURN`}
    </div>
  )
}

function SelfBar({ hp, shields }: { hp: number; shields: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          flex: 1,
          height: 30,
          borderRadius: 15,
          background: tokens.inset,
          border: `2px solid ${tokens.goldDk}`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '3px auto 3px 3px',
            width: `${(hp / 10) * 100}%`,
            borderRadius: 11,
            background: tokens.red,
          }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: tokens.fontDisplay,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {hp} / 10
        </span>
      </div>
      <ShieldPips shields={shields} />
    </div>
  )
}

function ShieldPips({ shields }: { shields: number }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <i
          key={i}
          data-testid={i < shields ? 'shield-pip-on' : 'shield-pip-off'}
          style={{
            display: 'block',
            width: 22,
            height: 26,
            borderRadius: 6,
            background: i < shields ? '#0f2a52' : tokens.inset,
            border:
              i < shields
                ? `2px solid ${tokens.blue}`
                : '1.5px dashed rgba(201,162,39,0.5)',
          }}
        />
      ))}
    </div>
  )
}

function TargetingScreen({
  card,
  opponents,
  livingOpponents,
  error,
  onPick,
  onCancel,
}: {
  card: HandCard
  opponents: PublicSeat[]
  livingOpponents: PublicSeat[]
  error: string | null
  onPick: (seatId: string) => void
  onCancel: () => void
}) {
  return (
    <div style={{ ...columnScreen, padding: gutter, boxSizing: 'border-box' }}>
      <div style={{ opacity: 0.32, filter: 'saturate(0.5)' }}>
        <FoeStrip opponents={opponents} />
      </div>

      <div
        style={{
          borderRadius: 14,
          border: `3px solid ${tokens.goldLt}`,
          background: tokens.panel,
          boxShadow: '0 0 24px rgba(240,217,138,0.45)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 14,
        }}
      >
        <img
          src={cardArtUrl(card.defId)}
          alt=""
          style={{
            width: 52,
            height: 74,
            borderRadius: 8,
            objectFit: 'cover',
            border: '1px solid rgba(201,162,39,0.5)',
            flexShrink: 0,
          }}
        />
        <div style={{ textAlign: 'left' }}>
          <b
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 19,
              display: 'block',
            }}
          >
            {card.name}
          </b>
          <span style={{ fontSize: 14, color: colors.mutedText }}>
            {describeEffects(card.effects)}
          </span>
        </div>
      </div>

      <p
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: 3,
          color: tokens.goldHot,
          textAlign: 'center',
          margin: '20px 0 12px',
        }}
      >
        CHOOSE A TARGET
      </p>

      {error && <p style={{ ...errorText, marginBottom: 12 }}>{error}</p>}

      <div
        style={{
          ...scrollRegion,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {livingOpponents.map((seat) => {
          const color = seat.deckId ? CLASS_COLORS[seat.deckId] : tokens.gold
          return (
            <button
              key={seat.seatId}
              onClick={() => onPick(seat.seatId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 14px',
                borderRadius: 14,
                background: `linear-gradient(${color}29, ${color}29), ${tokens.panel}`,
                border: `3px solid ${color}`,
                color: colors.text,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: tokens.inset,
                  border: `2px solid ${tokens.goldDk}`,
                  flexShrink: 0,
                }}
              />
              <b style={{ fontFamily: tokens.fontDisplay, fontSize: 19 }}>
                {seat.name}
              </b>
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: tokens.fontDisplay,
                  fontSize: 16,
                }}
              >
                {seat.hp} ♥ ·{' '}
                <em style={{ fontStyle: 'normal', color: tokens.blue }}>
                  {seat.shields} 🛡
                </em>
              </span>
            </button>
          )
        })}
      </div>

      <button
        onClick={onCancel}
        style={{
          ...primaryButton,
          marginTop: 16,
          background: 'none',
          boxShadow: 'none',
          border: '1.5px solid rgba(201,162,39,0.45)',
          color: colors.mutedText,
          fontSize: 14,
          letterSpacing: 2,
        }}
      >
        ← Choose a different card
      </button>
    </div>
  )
}
