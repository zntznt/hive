import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'
import { queueNotification, dispatchQueuedNotifications } from '@/lib/notify'

// Day-of reminder. Every other notification is queued by something a member
// did, so this is the app's only scheduled job: Vercel Cron calls it each
// morning, it finds today's events and tells the people who said they are
// going. Runs on the service role like the rest of the pipeline, since it
// acts for no particular user.
export const dynamic = 'force-dynamic'

// Mexico has not observed DST since 2022, so the offset is a constant.
const MX_OFFSET_HOURS = -6

// Bounds of "today" in Mexico City, expressed as UTC instants.
function todayInMexico(now: Date) {
  const shifted = new Date(now.getTime() + MX_OFFSET_HOURS * 3600_000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
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
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = supabaseService()
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no está configurado' }, { status: 500 })

  const { start, end } = todayInMexico(new Date())
  const { data: events, error } = await db
    .from('events')
    .select('id, slug, title, chosen_start')
    .eq('status', 'scheduled')
    .gte('chosen_start', start.toISOString())
    .lt('chosen_start', end.toISOString())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
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

  await dispatchQueuedNotifications(db, 100)
  return NextResponse.json({ events: (events ?? []).length, queued, skipped: skipped.length })
}
