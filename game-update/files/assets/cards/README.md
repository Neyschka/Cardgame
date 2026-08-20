# Card art — cleaned

31 files, one per card, named exactly `${cardId}.jpg`.

Source images were 2528×1664 JPEGs totalling 5.5 MB. These are 900px wide,
progressive, quality 82 — 1.9 MB total, still 3× the display size of a card.

## What changed from the originals

| Issue | Fix |
|---|---|
| `forager_s_find.jpeg` ≠ card id `foragers_find` | renamed |
| `hunter_s_mark.jpeg` ≠ card id `hunters_mark` | renamed |
| Mixed `.jpeg` / `.jpg` extensions | all `.jpg` |
| 2528px wide, ~250 KB each | 900px wide, ~60 KB each |

Filenames now match card ids exactly, so the game client can resolve art by
convention:

```ts
const art = new URL(`../assets/cards/${card.defId}.jpg`, import.meta.url).href
```

…instead of maintaining a 31-line explicit import map.

## Aspect ratio

Source art is 3:2 landscape; the card art slot is portrait. Use
`object-fit: cover` and accept the crop — the art is centre-weighted and
survives it. Do not letterbox.

## One thing to fix in the card generator

`src/config.ts` sets `bgPhoto` on each class to an `images.unsplash.com` URL,
used by both `CardFront.tsx` and `CardBack.tsx`. **This is a LAN-only demo** —
if the laptop has no internet, all four class backgrounds silently fail to
load.

Download those four images, drop them in `imports/`, and import them like the
card art. Four files, five minutes, removes a demo-day dependency on the
conference wifi.

## Colour note

`ACTION_COLORS` in `config.ts` uses pink `#f472b6` for heal; the phone-screen
mockup used green `#86efac`. Pick one — `config.ts` is the better source of
truth since the cards are already built against it. If you go with `config.ts`,
update the `.fx .h` rule in `phone-screens.html`.
