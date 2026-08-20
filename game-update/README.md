# game-update — rules migration (final)

Migrates the shipped, working build to the new rules (one card per turn,
effect arrays, numeric shields, four class decks) and applies the full art
pack. Written against the actual code in the repo, file by file.

## How to use

1. Drop this folder into the repo root, commit.
2. In Claude Code, from the repo root:

       Read game-update/PROMPT.md and apply it in order. Engine and its
       tests first; do not start the theme until the game plays correctly
       under the new rules. Tell me about anything that conflicts with
       the code as built rather than guessing.

## Contents

    PROMPT.md                        the migration brief (ordered, 10 sections)
    files/shared/src/index.ts        new wire contract (keeps DISPLAY_CONFIG_PATH)
    files/server/src/cards.ts        four 15-card class decks
    files/server/src/resolve.ts      pure resolver + validation + constants
    files/assets/                    22 SVGs, phone-screens.html, README
    files/assets/cards/              31 card images named `${defId}.jpg`

## What survives from the current build

Seats, tokens, reconnect + 60s timeout, host reassignment, rematch, the
display's config bootstrap, the whole socket wiring layer, and the target-
picker UI. The rewrite is the deal/turn/resolve core plus the card-facing
parts of both clients.

## The order, compressed

engine + tests → wire contract → player client → display client → theme →
card art → docs. Verify at each step; cut list is section 10.
