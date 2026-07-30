import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { CreateClubButton } from '../create-club-modal'

// The Clubs tab. This used to be a section inside Home, one 68px row per club,
// which made the two clubs you actually live in look like search results.
//
// A club is a place, so each one gets a card built from the same parts as its
// own front door: honeycomb head, hexagon mark, name, and the numbers under it.
// The card is a div rather than a button because it holds two destinations, the
// club and its next event. Two taps, two answers, no guessing.
//
// The kit's card also carries a strip of the club's recent photos. There is no
// photo feature in the app yet, so that band is left out rather than faked.

type Row = { club_id: string; role: string; clubs: { slug: string; name: string } | null }

function whenLabel(iso: string | null) {
  if (!iso) return 'buscando fecha'
  const d = new Date(iso)
  const today = new Date()
  const days = Math.round((d.getTime() - today.setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days > 1 && days < 7)
    return new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'America/Mexico_City' }).format(d)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' }).format(d)
}

export default async function ClubsPage() {
  const { supabase, profile } = await requireProfile()

  const { data: memberships } = await supabase
    .from('club_members')
    .select('club_id, role, clubs(slug, name)')
    .eq('user_id', profile.id)

  const rows = (memberships ?? []) as unknown as Row[]
  const clubIds = rows.map((r) => r.club_id)

  // Counts and the next event, for every club at once. Two queries rather than
  // two per club, since a member of six clubs would otherwise cost thirteen.
  const [{ data: roster }, { data: upcoming }] = await Promise.all([
    clubIds.length
      ? supabase.from('club_members').select('club_id, user_id').in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? supabase
          .from('events')
          .select('id, slug, title, chosen_start, club_id, status')
          .in('club_id', clubIds)
          .in('status', ['scheduling', 'scheduled'])
          .order('chosen_start', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] }),
  ])

  const memberCount = new Map<string, number>()
  for (const m of (roster ?? []) as { club_id: string }[]) {
    memberCount.set(m.club_id, (memberCount.get(m.club_id) ?? 0) + 1)
  }

  type Ev = { id: string; slug: string; title: string; chosen_start: string | null; club_id: string }
  const upcomingByClub = new Map<string, Ev[]>()
  for (const e of (upcoming ?? []) as Ev[]) {
    upcomingByClub.set(e.club_id, [...(upcomingByClub.get(e.club_id) ?? []), e])
  }

  const clubs = rows
    .filter((r) => r.clubs)
    .sort((a, b) => (a.clubs!.name ?? '').localeCompare(b.clubs!.name ?? ''))

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-ink-900">Clubs</h1>
        <CreateClubButton />
      </header>

      {clubs.length === 0 ? (
        <EmptyState
          icon="hashtag"
          title="Todavía no estás en ningún club"
          hint="Pide a quien organiza que te invite, o empieza el tuyo."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {clubs.map((m) => {
            const club = m.clubs!
            const events = upcomingByClub.get(m.club_id) ?? []
            const next = events[0]
            const members = memberCount.get(m.club_id) ?? 1
            return (
              <div
                key={m.club_id}
                className="overflow-hidden rounded-lg border border-line-card bg-paper shadow-card"
              >
                <Link
                  href={`/club/${club.slug}`}
                  className="block w-full text-center"
                  style={{ backgroundColor: 'var(--cream)', backgroundImage: 'var(--honeycomb)' }}
                >
                  {/* the honeycomb fades into paper so the head reads as one
                      surface with the body, not a banner stuck on a list row */}
                  <span
                    className="block px-3.5 pb-[13px] pt-3.5"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(251,247,239,0) 0%, rgba(251,247,239,.86) 44%, var(--paper) 100%)',
                    }}
                  >
                    <span className="mx-auto grid h-[66px] w-[60px] place-items-center bg-paper [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
                      <HexAvatar name={club.name} size={54} />
                    </span>
                    <span className="mt-1 flex flex-wrap items-center justify-center gap-[7px]">
                      <span className="font-display text-[19px] font-bold leading-[1.15] text-ink-900">
                        {club.name}
                      </span>
                      {m.role === 'admin' && <Badge tone="admin">admin</Badge>}
                      {m.role === 'organizer' && <Badge>organizador</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-500">
                      {members} {members === 1 ? 'miembro' : 'miembros'} · {events.length}{' '}
                      {events.length === 1 ? 'próximo' : 'próximos'}
                    </span>
                  </span>
                </Link>

                {/* What it is doing next. One row, one destination, and an
                    honest line when there is none. */}
                {next ? (
                  <Link
                    href={`/e/${next.slug}`}
                    className="flex min-h-12 w-full items-center gap-2.5 border-t border-line-divider px-3.5 py-2.5 text-left"
                  >
                    <Icon name="calendar-day" size={13} className="text-honey-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-ink-900">{next.title}</span>
                      <span className="text-[12px] text-ink-500">{whenLabel(next.chosen_start)}</span>
                    </span>
                    <Icon name="chevron-right" size={10} className="text-ink-300" />
                  </Link>
                ) : (
                  <p className="border-t border-line-divider px-3.5 py-2.5 text-[12.5px] text-ink-300">
                    Nada agendado todavía.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
