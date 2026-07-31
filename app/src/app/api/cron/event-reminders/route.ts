import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'
import { queueNotification, dispatchQueuedNotifications, reconcileHandoffs } from '@/lib/notify'
import { siteUrl } from '@/lib/site-url'
import { nudgeNonResponders, nudgeMissingAvailability } from '@/lib/nudge'

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
  // exists. This used to run anyway when it did not, on the reasoning that the
  // dedupe caps the damage at one message per person per event. That reasoning
  // was wrong twice: the endpoint also drives dispatchQueuedNotifications and
  // reconcileHandoffs, so an anonymous caller could flush the whole outbox on
  // demand and hammer the WhatsApp provider, and "we forgot to set the secret"
  // is exactly the state in which nobody is watching. Failing closed makes a
  // missing secret loud (reminders stop, the response says why) instead of
  // quietly leaving the job open to the internet.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no está configurado' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
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
    .is('deleted_at', null)
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
    .is('deleted_at', null)
    .gte('chosen_start', soon.start.toISOString())
    .lt('chosen_start', soon.end.toISOString())

  let nudged = 0
  for (const ev of upcoming ?? []) nudged += await nudgeNonResponders(db, ev.id)

  // The confirm deadline, honored. It was a column an organizer could fill in
  // and nothing ever read, so the field was a promise the app did not keep.
  // The people who never answered hear about it once the moment passes, and
  // what they owe depends on the phase: a painted grid while a time is still
  // being found, a yes or no once there is one.
  //
  // The window matters. Both nudges dedupe per member per event forever, so a
  // deadline sitting in the past is not a drip for anyone already on the
  // roster. But the roster is read live, so without a window a member who
  // joined today would wake up to one mail for every abandoned event the club
  // ever left open. Seven days is long enough to survive a few failed runs and
  // short enough that nobody is chased about last spring.
  const DEADLINE_WINDOW_DAYS = 7
  const windowStart = new Date(now.getTime() - DEADLINE_WINDOW_DAYS * 86_400_000)
  const { data: pastDeadline } = await db
    .from('events')
    .select('id, status')
    .in('status', ['scheduling', 'scheduled'])
    .is('deleted_at', null)
    .gte('confirm_deadline', windowStart.toISOString())
    .lte('confirm_deadline', now.toISOString())
    .order('confirm_deadline', { ascending: false })
    .limit(50)

  for (const ev of pastDeadline ?? []) {
    nudged +=
      ev.status === 'scheduling' ? await nudgeMissingAvailability(db, ev.id) : await nudgeNonResponders(db, ev.id)
  }

  // the daily backstop: resolve anything still waiting on a verdict, then send
  // today's reminders and the nudges queued above. This is the only part of
  // the job that actually delivers anything, so if the loops above ever run
  // long it is the part that must not be skipped.
  await reconcileHandoffs(db, 100)
  await dispatchQueuedNotifications(db, 100)

  // "Se borra solo a los 30 días", which the bin banner has been telling
  // people since the bin shipped and nothing was doing. Deleting an event
  // takes its RSVPs, contributions, expenses and settlements by cascade, so
  // this runs after the dispatch above rather than before it.
  const { data: purged } = await db.rpc('purge_deleted_events', { older_than_days: 30 })

  return NextResponse.json({
    events: (events ?? []).length,
    queued,
    skipped: skipped.length,
    nudged,
    purged: purged ?? 0,
  })
}
