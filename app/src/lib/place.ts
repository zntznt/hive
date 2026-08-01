// One place, one set of links.
//
// Three screens each built their own Google Maps URL out of the location text.
// That is the "one fact, one function" failure in its purest form: the club
// page embedded at zoom 14, the event page at 15, and the directions link ran
// a third, separate search on the same string. Three answers to "where is
// this", none of them checked against the others.
//
// Now the pin decides, when there is one. Coordinates are unambiguous, so the
// preview and the route land on the same square metre by construction, and
// the text goes back to being a label. Places saved before the pin existed
// have none, so the text is still the fallback and it is still one function
// deciding which of the two to use.

export type Located = { location: string | null; lat?: number | null; lng?: number | null }

// What Google should look for: the pin if it was dropped, the words if not.
export function mapQuery(p: Located): string | null {
  if (p.lat != null && p.lng != null) return `${p.lat},${p.lng}`
  return p.location?.trim() || null
}

// The embedded preview. Zoomed tighter with a pin, because there is something
// exact to show; wider without one, because the guess deserves context.
export function mapEmbedUrl(p: Located): string | null {
  const q = mapQuery(p)
  if (!q) return null
  const z = p.lat != null ? 16 : 14
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${z}&output=embed`
}

// "Cómo llegar". Same query as the preview, so what you looked at is where
// the car goes.
export function directionsUrl(p: Located): string | null {
  const q = mapQuery(p)
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null
}

// Whether the map is showing a decision or a guess. The UI says which, because
// "we think this is roughly it" and "somebody put a pin here" are different
// promises to make to a person about to drive across a city.
export const hasPin = (p: Located) => p.lat != null && p.lng != null
