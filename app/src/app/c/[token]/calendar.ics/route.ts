import { createClient } from '@supabase/supabase-js'
import { siteUrl } from '@/lib/site-url'

// A club's whole schedule as a subscription, not a download.
//
// The per-event route next door hands you one evening and then knows nothing:
// if the time moves, the entry on the phone is wrong. A calendar app polls
// this on its own schedule instead, so a new event appears, a moved time
// moves, and a cancellation arrives as cancelled, with nothing sent to anyone.
//
// The caller is a calendar app, which has no cookies and no session, so the
// token in the path is the entire authorization. That is why it is 32 random
// bytes rather than the club slug, why get_club_calendar matches it exactly,
// and why a club admin can rotate it. An anonymous client is used on purpose:
// the cookie-bound one would attach whichever member happened to be signed in
// on this browser and make the feed's access depend on who fetched it.

export const dynamic = 'force-dynamic'

function fold(line: string) {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) {
    out.push(rest.slice(0, 74))
    rest = ' ' + rest.slice(74)
  }
  out.push(rest)
  return out.join('\r\n')
}

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function stamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

type Row = {
  club_name: string
  event_id: string
  slug: string
  title: string
  location: string | null
  chosen_start: string
  chosen_end: string | null
  status: string
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return new Response('Not available', { status: 503 })

  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await anon.rpc('get_club_calendar', { cal_token: token })
  if (error) return new Response('Not found', { status: 404 })

  const rows = (data ?? []) as Row[]
  // An empty feed and a wrong token are the same 404 on purpose: a subscriber
  // holding a rotated link should be told the link is dead, not handed an
  // empty calendar that looks like the club stopped meeting.
  if (rows.length === 0) return new Response('Not found', { status: 404 })

  const clubName = rows[0].club_name
  const lines: (string | null)[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hive//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(clubName)}`),
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ]

  for (const e of rows) {
    const start = new Date(e.chosen_start)
    // Without an end, assume three hours: an entry with no duration renders as
    // a point in time and tells nobody when to leave.
    const end = e.chosen_end ? new Date(e.chosen_end) : new Date(start.getTime() + 3 * 3600_000)
    lines.push(
      'BEGIN:VEVENT',
      // the same UID the single-event route uses, so a member who already
      // added one evening by hand gets it updated rather than duplicated
      `UID:${e.event_id}@hive`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${esc(e.title)}`),
      fold(`DESCRIPTION:${esc(`${clubName} · ${siteUrl()}/e/${e.slug}`)}`),
      e.location ? fold(`LOCATION:${esc(e.location)}`) : null,
      fold(`URL:${siteUrl()}/e/${e.slug}`),
      e.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.filter(Boolean).join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // a subscription is meant to be re-fetched, so it must not be cached
      // between a change and the next poll
      'Cache-Control': 'no-store',
    },
  })
}
