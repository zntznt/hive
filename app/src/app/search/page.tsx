import { requireProfile } from '@/lib/gate'
import SearchClient, { type SearchClub, type SearchEvent, type SearchPerson } from './search-client'
import type { AvatarUser } from '@/components/ui/Avatar'
import { whenPill } from '@/components/ui/WhenPill'

// Everything this member is allowed to see, handed to the client once so
// typing filters instantly. RLS is what scopes it, not a where clause here.

export default async function SearchPage() {
  const { supabase, profile } = await requireProfile()

  const { data: memberships } = await supabase
    .from('club_members')
    .select('club_id, clubs(slug, name)')
    .eq('user_id', profile.id)

  const rows = (memberships ?? []) as unknown as { club_id: string; clubs: { slug: string; name: string } | null }[]
  const clubIds = rows.map((r) => r.club_id)

  const [{ data: roster }, { data: events }] = await Promise.all([
    clubIds.length
      ? supabase.from('club_members').select('club_id, user_id, users(id, display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)').in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
    supabase.from('events').select('slug, title, location, chosen_start, status, club_id').is('deleted_at', null).order('chosen_start', { ascending: false, nullsFirst: true }),
  ])

  const clubName = new Map(rows.filter((r) => r.clubs).map((r) => [r.club_id, r.clubs!.name]))
  const memberCount = new Map<string, number>()
  for (const m of (roster ?? []) as { club_id: string }[]) {
    memberCount.set(m.club_id, (memberCount.get(m.club_id) ?? 0) + 1)
  }

  type Ev = { slug: string; title: string; location: string | null; chosen_start: string | null; status: string; club_id: string | null }
  const evs = (events ?? []) as Ev[]

  const upcomingCount = new Map<string, number>()
  for (const e of evs) {
    if (e.club_id && (e.status === 'scheduling' || e.status === 'scheduled')) {
      upcomingCount.set(e.club_id, (upcomingCount.get(e.club_id) ?? 0) + 1)
    }
  }

  const clubs: SearchClub[] = rows
    .filter((r) => r.clubs)
    .map((r) => ({
      slug: r.clubs!.slug,
      name: r.clubs!.name,
      members: memberCount.get(r.club_id) ?? 1,
      upcoming: upcomingCount.get(r.club_id) ?? 0,
    }))

  const searchEvents: SearchEvent[] = evs.map((e) => ({
    slug: e.slug,
    title: e.title,
    club: (e.club_id && clubName.get(e.club_id)) || '',
    when: whenPill(e.chosen_start, e.status)?.label ?? '',
    place: e.location,
  }))

  // People you actually share a club with, and how many events you have both
  // been to. Yourself excluded: searching for your own name to find your own
  // events is what the "Tu historial" shortcut is for.
  const seen = new Map<string, SearchPerson>()
  for (const m of (roster ?? []) as unknown as { user_id: string; users: AvatarUser & { id: string } | null }[]) {
    if (m.user_id === profile.id || !m.users || seen.has(m.user_id)) continue
    seen.set(m.user_id, {
      id: m.user_id,
      name: m.users.display_name ?? '·',
      shared: 0,
      user: m.users,
    })
  }

  const ids = [...seen.keys()]
  if (ids.length) {
    const { data: shared } = await supabase
      .from('rsvps')
      .select('user_id, event_id')
      .in('user_id', [...ids, profile.id])
      .eq('status', 'in')
    const mine = new Set(
      (shared ?? []).filter((r) => r.user_id === profile.id).map((r) => r.event_id as string)
    )
    for (const r of shared ?? []) {
      const p = seen.get(r.user_id as string)
      if (p && mine.has(r.event_id as string)) p.shared++
    }
  }

  return <SearchClient clubs={clubs} events={searchEvents} people={[...seen.values()]} />
}
