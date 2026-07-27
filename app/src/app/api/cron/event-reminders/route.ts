import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'
import { queueNotification, dispatchQueuedNotifications, reconcileHandoffs } from '@/lib/notify'
import { siteUrl } from '@/lib/site-url'
import { nudgeNonResponders } from '@/lib/nudge'

// Day-of reminder. Every other notification is queued by something a member
// did, so this is the app's only scheduled job: Vercel Cron calls it each
// morning, it finds today's events and tells the people who said they are
// going. Runs on the service role like the rest of the pipeline, since it
// acts for no particular user.
export const dynamic = 'force-dynamic'

// Mexico has not observed DST since 2022, so the offset is a constant.
const MX_OFFSET_HOURS = -6

// Bounds of a day in Mexico City, expressed as UTC instants. offsetDays 0 is
// today, 2 is the day the nudge goes out for.
function dayInMexico(now: Date, offsetDays = 0) {
  const shifted = new Date(now.getTime() + MX_OFFSET_HOURS * 3600_000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate() + offsetDays
  const start = new Date(Date.UTC(y, m, d) - MX_OFFSET_HOURS * 3600_000)
  return { start, end: new Date(start.getTime() + 86_400_000) }
}

function timeInMexico(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso))
}

export async function GET(request: Request) {
  // Vercel attaches "Authorization: Bearer $CRON_SECRET" when that variable
  // exists, so we enforce it when it does. When it does not, we still run:
  // requiring it would mean the reminders silently never send until someone
  // remembers to set it, and the job is a poor target anyway. It returns
  // counts rather than data, it only ever touches events happening today,
  // and the dedupe below caps it at one message per person per event, so an
  // extra caller changes nothing.
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = supabaseService()
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no está configurado' }, { status: 500 })

  const now = new Date()
  const { start, end } = dayInMexico(now)
  const { data: events, error } = await db
    .from('events')
    .select('id, slug, title, chosen_start')
    .eq('status', 'scheduled')
    .gte('chosen_start', start.toISOString())
    .lt('chosen_start', end.toISOString())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const site = siteUrl()
  let queued = 0
  const skipped: string[] = []

  for (const ev of events ?? []) {
    // only people actually going, and not the ones still on the waitlist
    const { data: going } = await db
      .from('rsvps')
      .select('user_id')
      .eq('event_id', ev.id)
      .eq('status', 'in')
      .is('waitlist_pos', null)

    for (const r of going ?? []) {
      // the job is safe to run twice: one reminder per person per event, ever
      const { count } = await db
        .from('notification_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', r.user_id)
        .eq('template', 'event_today')
        .eq('payload->>event_id', ev.id)
      if (count && count > 0) {
        skipped.push(`${ev.slug}:${r.user_id}`)
        continue
      }

      await queueNotification(db, {
        userId: r.user_id,
        template: 'event_today',
        vars: {
          event: ev.title,
          time: ev.chosen_start ? timeInMexico(ev.chosen_start) : '',
          link: `${site}/e/${ev.slug}`,
          event_id: ev.id,
        },
      })
      queued++
    }
  }

  // Two days out, chase whoever never answered. Far enough ahead that the
  // organizer can still act on the replies, close enough that the date feels
  // real. nudgeNonResponders is idempotent per member per event, so re-running
  // the job cannot double-nudge anyone.
  const soon = dayInMexico(now, 2)
  const { data: upcoming } = await db
    .from('events')
    .select('id')
    .eq('status', 'scheduled')
    .gte('chosen_start', soon.start.toISOString())
    .lt('chosen_start', soon.end.toISOString())

  let nudged = 0
  for (const ev of upcoming ?? []) nudged += await nudgeNonResponders(db, ev.id)

  // the daily backstop: resolve anything still waiting on a verdict, then
  // send today's reminders and the nudges queued above
  await reconcileHandoffs(db, 100)
  await dispatchQueuedNotifications(db, 100)
  return NextResponse.json({
    events: (events ?? []).length,
    queued,
    skipped: skipped.length,
    nudged,
  })
}
