import type { SupabaseClient } from '@supabase/supabase-js'
import { queueNotification } from './notify'
import { siteUrl } from './site-url'

// The chase message, automated.
//
// Every other notification fires at members who already engaged: the event was
// created, you were promoted, your event is today. The one an organizer
// actually types by hand is "faltan 4 por confirmar", and the product's own
// success criterion is that nobody should have to type it.
//
// A non-responder is a club member with no RSVP row at all. Someone who
// answered "quizás" is deliberately left alone: they engaged, and nagging a
// maybe is how a useful nudge turns into noise people mute.

function whenText(iso: string | null) {
  if (!iso) return 'pronto'
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso))
}

// Returns how many members were queued. Safe to call repeatedly: one nudge per
// member per event, ever, matched on the event id inside the outbox payload,
// so an organizer tapping twice or the cron re-firing costs nobody a second
// message.
export async function nudgeNonResponders(db: SupabaseClient, eventId: string): Promise<number> {
  const { data: event } = await db
    .from('events')
    .select('id, slug, title, chosen_start, club_id, status')
    .eq('id', eventId)
    .maybeSingle()
  if (!event?.club_id || event.status !== 'scheduled') return 0

  const [{ data: roster }, { data: answered }] = await Promise.all([
    db.from('club_members').select('user_id').eq('club_id', event.club_id),
    db.from('rsvps').select('user_id').eq('event_id', event.id),
  ])

  const replied = new Set((answered ?? []).map((r) => r.user_id as string))
  const pending = (roster ?? []).map((m) => m.user_id as string).filter((id) => !replied.has(id))
  if (!pending.length) return 0

  const vars = {
    event: event.title as string,
    when: whenText(event.chosen_start as string | null),
    link: `${siteUrl()}/e/${event.slug}`,
    event_id: event.id as string,
  }

  let queued = 0
  for (const userId of pending) {
    const { count } = await db
      .from('notification_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('template', 'rsvp_pending')
      .eq('payload->>event_id', event.id)
    if (count && count > 0) continue

    await queueNotification(db, { userId, template: 'rsvp_pending', vars })
    queued++
  }
  return queued
}

// The same chase, one phase earlier. Before a time exists, the thing people
// owe is a painted grid, and an organizer staring at a half-filled heatmap has
// exactly one useful move.
//
// A non-responder here is a club member with no availability row at all.
// Someone who painted nothing on purpose still has a row, so they are left
// alone: they answered, the answer was "no time works".
export async function nudgeMissingAvailability(db: SupabaseClient, eventId: string): Promise<number> {
  const { data: event } = await db
    .from('events')
    .select('id, slug, title, club_id, status')
    .eq('id', eventId)
    .maybeSingle()
  if (!event?.club_id || event.status !== 'scheduling') return 0

  const [{ data: roster }, { data: painted }] = await Promise.all([
    db.from('club_members').select('user_id').eq('club_id', event.club_id),
    db.from('availability').select('user_id').eq('event_id', event.id),
  ])

  const done = new Set((painted ?? []).map((r) => r.user_id as string))
  const pending = (roster ?? []).map((m) => m.user_id as string).filter((id) => !done.has(id))
  if (!pending.length) return 0

  const vars = {
    event: event.title as string,
    link: `${siteUrl()}/e/${event.slug}`,
    event_id: event.id as string,
  }

  let queued = 0
  for (const userId of pending) {
    const { count } = await db
      .from('notification_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('template', 'availability_pending')
      .eq('payload->>event_id', event.id)
    if (count && count > 0) continue

    await queueNotification(db, { userId, template: 'availability_pending', vars })
    queued++
  }
  return queued
}
