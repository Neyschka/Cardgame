// Card art, one `${defId}.jpg` per card definition — `server/src/cards.ts`'s
// `defId` is also the art filename. Resolved as a URL (not a static <img src>)
// so Vite fingerprints and bundles each file rather than serving it from a
// guessed path; relative to this file's own location, not the caller's, so it
// resolves the same regardless of which screen imports it.
export function cardArtUrl(defId: string): string {
  return new URL(`./cards/${defId}.jpg`, import.meta.url).href
}
