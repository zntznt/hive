import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// Address text in, a point out.
//
// This is what puts the pin somewhere sensible before anybody drags it.
// Typing "calle 20 25 san jose" should land the map on that street, so the
// correction is a nudge rather than a hunt across the country.
//
// It proxies Nominatim rather than calling it from the browser for two
// reasons. Their policy asks for an identifying User-Agent, which a browser
// will not let us set, and going through here keeps the member's IP out of
// somebody else's logs on every keystroke.
//
// Signed in only. It is a free geocoder attached to our name, not a public
// one, and an open endpoint is an invitation to have that name rate-limited.

const MX = 'mx'

export async function GET(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const params = new URL(request.url).searchParams
  // Reverse: a pin in, a street line out. The forward direction gets a place
  // near where you typed; this one names where the pin actually landed, which
  // is what the day-of header prints and what the forward answer cannot give
  // you once somebody has dragged it.
  const lat = params.get('lat')
  const lng = params.get('lng')
  if (lat && lng) return reverse(Number(lat), Number(lng))

  const q = params.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json({ results: [] })

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')
  // This app ships in Mexico, and biasing the search is the difference between
  // "Calle 20" meaning a street in Puebla and one in Florida.
  url.searchParams.set('countrycodes', MX)
  url.searchParams.set('accept-language', 'es')

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Hive/1.0 (club event coordination; https://hive.zntznt.com)',
        Accept: 'application/json',
      },
      // A geocode is worth a second of somebody's time, not ten.
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return NextResponse.json({ results: [] })
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    return NextResponse.json({
      results: rows.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lon),
        label: r.display_name as string,
      })),
    })
  } catch {
    // The geocoder being down is not an error the member can do anything
    // about, and the pin is still draggable without it.
    return NextResponse.json({ results: [] })
  }
}

// The street line for a point. Assembled from the parts rather than taking
// Nominatim's display_name, which trails the country, the postcode and the
// state and would put "México" on a card read only by people in Mexico.
async function reverse(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ area: null })
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('accept-language', 'es')
  url.searchParams.set('zoom', '18')
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Hive/1.0 (club event coordination; https://hive.zntznt.com)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return NextResponse.json({ area: null })
    const json = (await res.json()) as { address?: Record<string, string> }
    const a = json.address ?? {}
    const street = [a.road, a.house_number].filter(Boolean).join(' ')
    const neighbourhood = a.neighbourhood ?? a.suburb ?? a.quarter ?? null
    const city = a.city ?? a.town ?? a.village ?? a.state ?? null
    const area = [street || null, neighbourhood, city].filter(Boolean).join(', ')
    return NextResponse.json({ area: area || null })
  } catch {
    // A missing street line is a card that falls back to the venue name, which
    // is what it did before this existed. Not worth an error.
    return NextResponse.json({ area: null })
  }
}
