import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { FaceStack } from '@/components/ui/FaceStack'
import { type AvatarUser } from '@/components/ui/Avatar'
import { CreateClubButton } from '../create-club-modal'
import { Page, PageHeader } from '@/components/ui/Page'
import { WhenPill } from '@/components/ui/WhenPill'
import { clubFooter, quietSince, type CardEvent } from '@/lib/club-card'

// The Clubs tab.
//
// A club is a place, so each one gets a card built from the same parts as its
// own front door: honeycomb head, hexagon mark, name, the people, and a footer
// that says what it is doing next.
//
// The card's height is the information. A club with something on tonight is
// tall and loud and ends in an address; a club that has gone quiet is one head
// and one sentence. Making them all the same height was the flatness this
// screen had: five identical cards say "five clubs" and nothing else.
//
// Faces replace the member count, and the upcoming count is gone. "2 miembros ·
// 2 próximos" is two numbers nobody pictures, and the second one was answering
// a question the footer already answers by name.

type Row = {
  club_id: string
  role: string
  clubs: { slug: string; name: string; avatar_url: string | null; banner_url: string | null } | null
}

export default async function ClubsPage() {
  const { supabase, profile } = await requireProfile()

  const { data: memberships } = await supabase
    .from('club_members')
    .select('club_id, role, clubs(slug, name, avatar_url, banner_url)')
    .eq('user_id', profile.id)

  const rows = (memberships ?? []) as unknown as Row[]
  const clubIds = rows.map((r) => r.club_id)

  // Everything for every club at once. A member of six clubs would otherwise
  // cost twenty-five round trips.
  const [{ data: roster }, { data: events }, { data: photos }] = await Promise.all([
    clubIds.length
      ? supabase
          .from('club_members')
          .select('club_id, user_id, joined_at, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
          .in('club_id', clubIds)
          .order('joined_at')
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? supabase
          .from('events')
          .select('id, slug, title, chosen_start, chosen_end, location, club_id, status')
          .in('club_id', clubIds)
          .is('deleted_at', null)
          .order('chosen_start', { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? supabase
          .from('event_photos')
          .select('path, created_at, events!inner(club_id)')
          .in('events.club_id', clubIds)
          .order('created_at', { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [] }),
  ])

  type RosterRow = { club_id: string; user_id: string; users: AvatarUser | null }
  const facesOf = new Map<string, AvatarUser[]>()
  const countOf = new Map<string, number>()
  for (const m of (roster ?? []) as unknown as RosterRow[]) {
    countOf.set(m.club_id, (countOf.get(m.club_id) ?? 0) + 1)
    if (m.users) facesOf.set(m.club_id, [...(facesOf.get(m.club_id) ?? []), m.users])
  }

  type Ev = CardEvent & { club_id: string }
  const eventsOf = new Map<string, Ev[]>()
  for (const e of (events ?? []) as unknown as Ev[]) {
    eventsOf.set(e.club_id, [...(eventsOf.get(e.club_id) ?? []), e])
  }

  // Three recent photos per club, signed in one call rather than one per club.
  type PhotoRow = { path: string; events: { club_id: string } | null }
  const pathsOf = new Map<string, string[]>()
  for (const p of (photos ?? []) as unknown as PhotoRow[]) {
    const cid = p.events?.club_id
    if (!cid) continue
    const have = pathsOf.get(cid) ?? []
    if (have.length < 3) pathsOf.set(cid, [...have, p.path])
  }
  const allPaths = [...pathsOf.values()].flat()
  const signed = new Map<string, string>()
  if (allPaths.length) {
    const { data: urls } = await supabase.storage.from('event-photos').createSignedUrls(allPaths, 3600)
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }

  const clubs = rows.filter((r) => r.clubs)
  const now = new Date()
  const carded = clubs.map((m) => {
    const evs = eventsOf.get(m.club_id) ?? []
    const lastDone = evs.find((e) => e.chosen_start && Date.parse(e.chosen_start) < now.getTime())
    return { m, club: m.clubs!, footer: clubFooter(evs, lastDone?.chosen_start ?? null, now) }
  })

  // Rule 6: no more than four identical rows. Past four clubs the quiet ones
  // stop being cards and become one labelled group, so the ones with something
  // going on keep their shape.
  const grouped = carded.length > 4
  const loud = grouped ? carded.filter((c) => c.footer.kind !== 'quiet') : carded
  const quiet = grouped ? carded.filter((c) => c.footer.kind === 'quiet') : []

  // The club with something on tonight goes first and takes the honey border.
  loud.sort((a, b) => {
    const rank = (k: string) => (k === 'today' ? 0 : k === 'next' ? 1 : 2)
    return rank(a.footer.kind) - rank(b.footer.kind) || a.club.name.localeCompare(b.club.name, 'es')
  })
  quiet.sort((a, b) => a.club.name.localeCompare(b.club.name, 'es'))

  return (
    <Page>
      <PageHeader title="Clubes" action={<CreateClubButton />} />

      {clubs.length === 0 ? (
        <EmptyState
          icon="hashtag"
          title="Todavía no estás en ningún club"
          hint="Pide a quien organiza que te invite, o empieza el tuyo."
        />
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {loud.map(({ m, club, footer }) => {
              const faces = facesOf.get(m.club_id) ?? []
              const total = countOf.get(m.club_id) ?? faces.length
              const strip = (pathsOf.get(m.club_id) ?? []).map((p) => signed.get(p)).filter(Boolean) as string[]
              const tonight = footer.kind === 'today'
              return (
                <div
                  key={m.club_id}
                  className={`overflow-hidden rounded-lg bg-paper shadow-card ${
                    tonight ? 'border-[1.5px] border-honey-500' : 'border border-line-card'
                  }`}
                >
                  <Link
                    href={`/club/${club.slug}`}
                    className="relative block w-full overflow-hidden text-center"
                    style={{
                      backgroundColor: 'var(--cream)',
                      backgroundImage: club.banner_url ? undefined : 'var(--honeycomb)',
                    }}
                  >
                    {club.banner_url && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-[96px] bg-cover bg-center"
                        style={{ backgroundImage: `url(${club.banner_url})` }}
                      />
                    )}
                    <span
                      className="relative block px-3.5 pb-[13px] pt-3.5"
                      style={{
                        // A photo needs a heavier scrim than the honeycomb
                        // does, or the club's own name lands on somebody's
                        // living room and stops being readable.
                        background: club.banner_url
                          ? 'linear-gradient(180deg, rgba(251,247,239,.2) 0%, rgba(251,247,239,.9) 46%, var(--paper) 100%)'
                          : 'linear-gradient(180deg, rgba(251,247,239,0) 0%, rgba(251,247,239,.86) 44%, var(--paper) 100%)',
                      }}
                    >
                      <span className="mx-auto grid h-[66px] w-[60px] place-items-center bg-paper [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
                        <HexAvatar name={club.name} src={club.avatar_url} size={54} />
                      </span>
                      <span className="mt-1 flex flex-wrap items-center justify-center gap-[7px]">
                        <span className="font-display text-[19px] font-bold leading-[1.15] text-ink-900">
                          {club.name}
                        </span>
                        {m.role === 'admin' && <Badge tone="admin">admin</Badge>}
                        {m.role === 'organizer' && <Badge>organizador</Badge>}
                      </span>
                      {/* who, not how many */}
                      <span className="mt-1.5 flex justify-center">
                        <FaceStack people={faces} total={total} size={22} max={5} />
                      </span>
                    </span>
                  </Link>

                  {/* Recent photos, only when there are some. Three empty
                      dashed boxes on a list is the club telling you about a
                      feature instead of about itself. */}
                  {strip.length > 0 && (
                    <Link href={`/club/${club.slug}`} className="flex gap-1.5 px-3 pb-3">
                      {strip.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={url}
                          alt=""
                          className="h-[72px] min-w-0 flex-1 rounded-sm object-cover"
                          style={{ background: 'var(--cream-sunk)' }}
                        />
                      ))}
                    </Link>
                  )}

                  {footer.kind === 'today' ? (
                    // On the day the address is the whole answer, so it takes
                    // the dark strip and full weight. The time drops to the
                    // line under it: you know it is tonight, you need to know
                    // where to go.
                    <Link
                      href={`/e/${footer.event.slug}`}
                      className="flex min-h-14 w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
                      style={{ background: 'var(--charcoal)' }}
                    >
                      <Icon name="location-dot" size={14} className="flex-shrink-0 text-honey-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-on-dark">
                          {footer.event.location ?? footer.event.title}
                        </span>
                        <span className="block truncate text-xs text-on-dark-mute">
                          {footer.event.title} · hoy {footer.window}
                        </span>
                      </span>
                      <Icon name="chevron-right" size={10} className="flex-shrink-0 text-on-dark-mute" />
                    </Link>
                  ) : footer.kind === 'next' ? (
                    <Link
                      href={`/e/${footer.event.slug}`}
                      className="flex min-h-12 w-full items-center gap-2.5 border-t border-line-divider px-3.5 py-2.5 text-left"
                    >
                      <Icon name="calendar-day" size={13} className="flex-shrink-0 text-honey-700" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink-900">
                        {footer.event.title}
                      </span>
                      <WhenPill at={footer.event.chosen_start} />
                      <Icon name="chevron-right" size={10} className="flex-shrink-0 text-ink-300" />
                    </Link>
                  ) : (
                    <div className="flex min-h-12 items-center gap-2.5 border-t border-line-divider px-3.5 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-300">
                        {quietSince(footer.since)}
                      </span>
                      <Link
                        href={`/club/${club.slug}/new-event`}
                        className="tap -my-2 flex-shrink-0 py-2 text-[12.5px] font-bold text-honey-800"
                      >
                        Nuevo evento
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {quiet.length > 0 && (
            <section className="mt-6">
              <p className="eyebrow mb-2.5">Sin nada planeado</p>
              <div className="overflow-hidden rounded-md border border-line-card bg-paper">
                {quiet.map(({ m, club }, i) => (
                  <Link
                    key={m.club_id}
                    href={`/club/${club.slug}`}
                    className={`flex min-h-12 items-center gap-2.5 px-3.5 py-2.5 ${i ? 'border-t border-line-divider' : ''}`}
                  >
                    <HexAvatar name={club.name} src={club.avatar_url} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink-900">{club.name}</span>
                    <FaceStack people={facesOf.get(m.club_id) ?? []} total={countOf.get(m.club_id)} size={18} max={3} />
                    <Icon name="chevron-right" size={10} className="flex-shrink-0 text-ink-300" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Page>
  )
}
