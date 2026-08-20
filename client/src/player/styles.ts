// Placeholder visuals only — no card art, per the v1 scope decision. Carried
// over from the chosen prototype (issues/06 Variant C, issues/08) with the
// prototype's phone bezel dropped: this runs full-screen on a real phone.
//
// Sizing is phone-first and fluid: spacing and type scale with the viewport
// between a 320px phone and a 520px cap, so nothing has to be zoomed or
// side-scrolled. `--app-height` and the CSS reset come from index.html.

import type { CSSProperties } from 'react'

export const colors = {
  background: '#0b1220',
  panel: '#1c2942',
  deadPanel: '#1a1f2b',
  border: '#33456e',
  rule: '#232f4d',
  text: '#eee',
  mutedText: '#8fa3c9',
  deadText: '#666',
  accent: '#ffd166',
} as const

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
  background: colors.background,
  color: colors.text,
  fontFamily: 'sans-serif',
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
  background: colors.background,
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

export const input: CSSProperties = {
  padding: 12,
  minHeight: TAP_TARGET,
  width: '100%',
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  color: colors.text,
  // 16px or larger, or iOS zooms the page in on focus and never zooms back.
  fontSize: 16,
}

export const primaryButton: CSSProperties = {
  padding: 14,
  minHeight: TAP_TARGET,
  borderRadius: 8,
  border: 'none',
  background: colors.accent,
  color: '#1a1a1a',
  fontWeight: 700,
  fontSize: 16,
  width: '100%',
  cursor: 'pointer',
}

/** Disabled controls stay visible and keep their label's reason — nothing in
 *  this client hides a control the player might expect to find. */
export const disabledButton: CSSProperties = {
  ...primaryButton,
  opacity: 0.4,
  cursor: 'not-allowed',
}

export const errorText: CSSProperties = {
  color: '#ff8f8f',
  fontSize: 14,
  textAlign: 'center',
  margin: 0,
}
