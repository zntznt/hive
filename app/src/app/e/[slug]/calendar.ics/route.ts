import { supabaseServer } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'

// A VCALENDAR for one event, so it can live in the calendar a member already
// checks. The reminder we send is a message that has to arrive and be read.
// This is an entry the phone owns: it survives uninstalling Hive, it fires
// without a network, and it costs nothing per member.
//
// RLS decides who gets it. The route reads with the caller's session, so a
// link forwarded to somebody outside the club returns 404 rather than the
// club's schedule.

// Folding at 75 octets, per RFC 5545. A long enough description silently
// breaks strict parsers otherwise, and Apple Calendar is one of them.
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

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await supabaseServer()
  const { data: event } = await supabase
    .from('events')
    .select('id, slug, title, description, location, chosen_start, chosen_end, status, clubs(name)')
    .eq('slug', slug)
    .maybeSingle()

  if (!event?.chosen_start) return new Response('No encontrado', { status: 404 })

  const club = (event.clubs as unknown as { name: string } | null)?.name
  const start = new Date(event.chosen_start as string)
  // Without an end, assume three hours. A calendar entry with no duration
  // renders as a point in time and tells nobody when to leave.
  const end = event.chosen_end ? new Date(event.chosen_end as string) : new Date(start.getTime() + 3 * 3600_000)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hive//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // stable per event, so re-adding updates the entry instead of duplicating it
    `UID:${event.id}@hive`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    fold(`SUMMARY:${esc(event.title as string)}`),
    club ? fold(`DESCRIPTION:${esc(`${club} · ${siteUrl()}/e/${event.slug}`)}`) : null,
    event.location ? fold(`LOCATION:${esc(event.location as string)}`) : null,
    fold(`URL:${siteUrl()}/e/${event.slug}`),
    event.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
    },
  })
}
