// Design tokens and layout primitives for the player client. Palette,
// gradients and type scale are ported from
// `game-update/files/assets/phone-screens.html`'s CSS custom properties —
// that file is the source of truth for the numbers below; this just makes
// them usable from React.
//
// Layout mechanics (phone-first fluid sizing, safe-area insets, the
// scroll/action-bar split) predate the theme and aren't part of it — kept
// as-is.

import type { CSSProperties } from 'react'

/** The raw palette and type scale, unstyled — reach for these directly when
 *  a component needs something the primitives below don't cover (e.g. a
 *  one-off gold border on a card that tints by class). */
export const tokens = {
  void: '#07060f',
  table1: '#3a2154',
  table2: '#1f1236',
  table3: '#0d0718',
  panel: '#1b1030',
  inset: '#120a22',
  goldLt: '#f0d98a',
  gold: '#c9a227',
  goldDk: '#8a6a14',
  goldHot: '#fde68a',
  parchment: '#e4d5b8',
  muted: '#a08f6f',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#f59e0b',
  fontDisplay: "'Cinzel', Georgia, serif",
  fontBody: "'EB Garamond', Georgia, serif",
} as const

/** Kept for the handful of places that still want a flat swap-in palette
 *  (error text, muted labels) rather than reaching into `tokens` directly. */
export const colors = {
  background: tokens.void,
  panel: tokens.panel,
  deadPanel: '#150c28',
  border: tokens.goldDk,
  rule: 'rgba(201,162,39,0.35)',
  text: tokens.parchment,
  mutedText: tokens.muted,
  deadText: '#6b5f7d',
  accent: tokens.goldLt,
} as const

/** The phone's backdrop — same radial wash on every screen. */
export const tableGradient = `radial-gradient(120% 80% at 50% 30%, ${tokens.table1}, ${tokens.table2} 60%, ${tokens.table3})`

/** Edge spacing, tight on a small phone and roomier on a big one. */
export const gutter = 'clamp(14px, 4.5vw, 24px)'

/** Fingers need ~44px of target whatever the screen size (Apple HIG, and the
 *  same figure in Material's 48dp). */
const TAP_TARGET = 44

const appHeight = 'var(--app-height, 100vh)'
const sideInsets: CSSProperties = {
  paddingLeft: 'env(safe-area-inset-left)',
  paddingRight: 'env(safe-area-inset-right)',
}

/** Fills a phone screen, then stops widening: past ~520px a two-column hand
 *  grid only stretches its cards, so the column centres instead. */
export const screen: CSSProperties = {
  minHeight: appHeight,
  width: '100%',
  maxWidth: 520,
  margin: '0 auto',
  background: tableGradient,
  color: colors.text,
  fontFamily: tokens.fontBody,
  display: 'flex',
  flexDirection: 'column',
  ...sideInsets,
}

/** A screen that owns the full height exactly — header, scrolling middle,
 *  pinned action bar — so a tall hand can't push the Play button off-screen. */
export const columnScreen: CSSProperties = {
  ...screen,
  height: appHeight,
  overflow: 'hidden',
}

/** The scrolling middle of a `columnScreen`. `minHeight: 0` is what lets a flex
 *  child actually shrink and scroll rather than growing its parent. */
export const scrollRegion: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
}

/** Bottom bar, clear of the iPhone home indicator. */
export const actionBar: CSSProperties = {
  padding: gutter,
  paddingBottom: `calc(${gutter} + env(safe-area-inset-bottom))`,
  borderTop: `1px solid ${colors.rule}`,
  background: 'transparent',
}

export const centered: CSSProperties = {
  ...screen,
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 16,
  // Longhands come after the shorthand so the insets survive.
  padding: gutter,
  paddingLeft: `calc(${gutter} + env(safe-area-inset-left))`,
  paddingRight: `calc(${gutter} + env(safe-area-inset-right))`,
  paddingBottom: `calc(${gutter} + env(safe-area-inset-bottom))`,
}

/** `.title` — Cinzel, bold, centred. The big heading at the top of a screen. */
export const title: CSSProperties = {
  fontFamily: tokens.fontDisplay,
  fontSize: 'clamp(24px, 7vw, 30px)',
  fontWeight: 700,
  letterSpacing: 1,
  textAlign: 'center',
  margin: '14px 0 4px',
}

/** `.sub` — the muted line under a title. */
export const subtitle: CSSProperties = {
  fontSize: 'clamp(14px, 4vw, 17px)',
  color: colors.mutedText,
  textAlign: 'center',
  marginBottom: 8,
}

/** `.label` — small tracked-out caption above a field or section. */
export const label: CSSProperties = {
  fontFamily: tokens.fontDisplay,
  fontSize: 12,
  letterSpacing: 4,
  color: colors.mutedText,
  textAlign: 'center',
  marginBottom: 10,
  textTransform: 'uppercase',
}

/** `.rule` — a thin gold-fade divider. */
export const rule: CSSProperties = {
  height: 1,
  background: `linear-gradient(90deg, transparent, ${tokens.gold}, transparent)`,
  opacity: 0.6,
  margin: '18px 4px',
  border: 'none',
}

export const input: CSSProperties = {
  padding: '14px 16px',
  minHeight: TAP_TARGET,
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 10,
  border: `2px solid ${tokens.goldDk}`,
  background: tokens.inset,
  color: colors.text,
  fontFamily: tokens.fontBody,
  // 16px or larger, or iOS zooms the page in on focus and never zooms back.
  fontSize: 20,
}

/** `.btn` — the gold gradient call-to-action. */
export const primaryButton: CSSProperties = {
  padding: 18,
  minHeight: TAP_TARGET,
  borderRadius: 14,
  border: 'none',
  background: `linear-gradient(180deg, ${tokens.goldLt}, ${tokens.gold} 50%, ${tokens.goldDk})`,
  boxShadow: '0 0 18px rgba(240,217,138,0.28)',
  color: '#2a1a03',
  fontFamily: tokens.fontDisplay,
  fontWeight: 700,
  fontSize: 17,
  letterSpacing: 2,
  width: '100%',
  cursor: 'pointer',
}

/** `.btn.off` — disabled controls stay visible and keep their label's reason,
 *  nothing in this client hides a control the player might expect to find. */
export const disabledButton: CSSProperties = {
  padding: 18,
  minHeight: TAP_TARGET,
  borderRadius: 14,
  border: `1.5px solid rgba(201,162,39,0.35)`,
  background: colors.panel,
  boxShadow: 'none',
  color: colors.mutedText,
  fontFamily: tokens.fontDisplay,
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: 1,
  width: '100%',
  cursor: 'not-allowed',
}

export const errorText: CSSProperties = {
  color: tokens.red,
  fontSize: 14,
  textAlign: 'center',
  margin: 0,
}
