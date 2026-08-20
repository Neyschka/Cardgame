// A knocked-out seat gets this and nothing else — no read-only table view, the
// shared display already covers that for everyone watching (spec.md's
// "Eliminated player experience").

import { centered, colors } from './styles'

export function Eliminated() {
  return (
    <div style={centered}>
      <div style={{ fontSize: 48 }}>💀</div>
      <h2 style={{ margin: 0 }}>You&rsquo;re eliminated</h2>
      <p style={{ color: colors.mutedText, margin: 0 }}>
        Watch the shared screen for the rest of the match.
      </p>
    </div>
  )
}
