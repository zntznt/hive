import { tf, type Lang } from './lang'
import type { SupabaseClient } from '@supabase/supabase-js'

// "Since you were away": the last 48 hours of things that happened to you,
// none of which you have to do anything about.
//
// This is the deliberate alternative to an inbox. Anything actionable is a
// plate item and carries the badge; anything purely informational lands here,
// has no unread state, and expires on its own. Nothing to mark read, nothing
// that accumulates, nothing to feel behind on.
export type AwayItem = {
  id: string
  kind: 'time_locked' | 'cancelled' | 'settled'
  text: string
  href: string
  at: string
}

const WINDOW_HOURS = 48

export async function getAwayItems(
  supabase: SupabaseClient,
  userId: string,
  lang: Lang = 'es'
): Promise<AwayItem[]> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString()

  const { data: myClubs } = await supabase.from('club_members').select('club_id').eq('user_id', userId)
  const clubIds = (myClubs ?? []).map((m) => m.club_id as string)
  if (!clubIds.length) return []

  const [{ data: events }, { data: settled }] = await Promise.all([
    supabase
      .from('events')
      .select('id, slug, title, scheduled_at, cancelled_at, chosen_start')
      .in('club_id', clubIds)
      .or(`scheduled_at.gte.${since},cancelled_at.gte.${since}`),
    // a debt of yours that someone confirmed, which is the one money event
    // that closes rather than opens something
    supabase
      .from('settlements')
      // settlements never had an updated_at, so this whole query answered
      // 42703 and the recap silently lost the one money item it carries.
      // created_at is the only timestamp on the row: a settlement is recorded
      // and confirmed within the same conversation often enough that it is a
      // fair stand in, and a slightly early item beats no item at all.
      .select('id, event_id, amount_cents, confirmed, created_at, from_user, to_user, events(slug, title)')
      .eq('from_user', userId)
      .eq('confirmed', true)
      .gte('created_at', since),
  ])

  const items: AwayItem[] = []

  for (const e of (events ?? []) as {
    id: string
    slug: string
    title: string
    scheduled_at: string | null
    cancelled_at: string | null
  }[]) {
    if (e.cancelled_at && e.cancelled_at >= since) {
      items.push({
        id: `cancelled-${e.id}`,
        kind: 'cancelled',
        text: tf(lang, 'away.cancelled', { title: e.title }),
        href: `/e/${e.slug}`,
        at: e.cancelled_at,
      })
    } else if (e.scheduled_at && e.scheduled_at >= since) {
      items.push({
        id: `locked-${e.id}`,
        kind: 'time_locked',
        text: tf(lang, 'away.timeLocked', { title: e.title }),
        href: `/e/${e.slug}`,
        at: e.scheduled_at,
      })
    }
  }

  for (const s of (settled ?? []) as unknown as {
    id: string
    created_at: string
    events: { slug: string; title: string } | null
  }[]) {
    if (!s.events) continue
    items.push({
      id: `settled-${s.id}`,
      kind: 'settled',
      text: tf(lang, 'away.settled', { title: s.events.title }),
      href: `/e/${s.events.slug}`,
      at: s.created_at,
    })
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
}
