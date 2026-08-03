import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { FaceStack } from '@/components/ui/FaceStack'
import { type AvatarUser } from '@/components/ui/Avatar'
import { CreateClubButton } from '../create-club-modal'
import { Page, PageHeader } from '@/components/ui/Page'
import { WhenPill } from '@/components/ui/WhenPill'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { clubFooter, quietSince, type CardEvent } from '@/lib/club-card'
import { whenPill } from '@/lib/when'
import { fmtSpan } from '@/lib/time'
import { getT } from '@/lib/current-lang'

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
  const { t, tf, lang } = await getT()

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
          .select('id, slug, title, chosen_start, chosen_end, location, area, club_id, status')
          .in('club_id', clubIds)
          .is('deleted_at', null)
          .order('chosen_start', { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? supabase
          .from('event_photos')
          // the title comes back with the photo because each tile is captioned
          // with the night it came from: six squares with no captions are a
          // gallery, and this is a club telling you what it has been doing
          .select('path, created_at, events!inner(club_id, title, slug)')
          .in('events.club_id', clubIds)
          .order('created_at', { ascending: false })
          .limit(120)
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

  // Six recent photos per club, signed in one call rather than one per club.
  type PhotoRow = { path: string; events: { club_id: string; title: string; slug: string } | null }
  type Shot = { path: string; caption: string; slug: string }
  const shotsOf = new Map<string, Shot[]>()
  for (const p of (photos ?? []) as unknown as PhotoRow[]) {
    const cid = p.events?.club_id
    if (!cid) continue
    const have = shotsOf.get(cid) ?? []
    if (have.length < 6) shotsOf.set(cid, [...have, { path: p.path, caption: p.events?.title ?? '', slug: p.events?.slug ?? '' }])
  }
  const allPaths = [...shotsOf.values()].flat().map((s) => s.path)
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
    return { m, club: m.clubs!, footer: clubFooter(evs, lastDone?.chosen_start ?? null, now, lang) }
  })

  // Rule 6 answers *too many*, not *quiet*. Past four clubs the quiet ones
  // stop being cards and become one labelled group; at four or fewer a quiet
  // club still gets a card, just a shorter one. Gating on quietness instead
  // meant somebody in two clubs, one of them dormant, got one card and then a
  // section header over a single lonely row.
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
      <PageHeader title={t('clubs.title')} lede={t('clubs.lede')} />

      {clubs.length === 0 ? (
        <EmptyState
          icon="hashtag"
          title={t('clubs.empty.title')}
          hint={t('clubs.empty.hint')}
        />
      ) : (
        <>
          <div className="mb-[26px] flex flex-col gap-[14px]">
            {loud.map(({ m, club, footer }) => {
              const faces = facesOf.get(m.club_id) ?? []
              const total = countOf.get(m.club_id) ?? faces.length
              const strip = (shotsOf.get(m.club_id) ?? [])
                .map((s) => ({ url: signed.get(s.path), caption: s.caption, slug: s.slug }))
                .filter((s): s is { url: string; caption: string; slug: string } => !!s.url)
              const tonight = footer.kind === 'today'
              // Height tracks how much is going on. A quiet club keeps its
              // card but wears a smaller mark and a tighter head, and never a
              // photo strip: emptiness must not cost as much height as
              // activity.
              //
              // Quiet is nothing coming AND nothing to show. A club with no
              // date but a wall of photographs from last month is not dormant,
              // and shrinking it to a head and one line would say it was.
              const hush = footer.kind === 'quiet' && strip.length === 0
              const canStart = m.role === 'admin' || m.role === 'organizer'
              return (
                <div
                  key={m.club_id}
                  className={`overflow-hidden rounded-lg border bg-paper ${
                    tonight ? 'border-honey-500' : 'border-line-card shadow-card'
                  }`}
                  // the club with something on tonight sits a little further
                  // off the page than the rest of the stack
                  style={tonight ? { boxShadow: '0 2px 10px rgba(43,38,32,.10)' } : undefined}
                >
                  {/* The club page's head, shrunk. Honeycomb, dissolving into
                      the card body so it reads as one surface rather than a
                      banner stuck on top of a list row, and the height is the
                      head's own padding rather than a fixed 5:2 strip: that is
                      what lets a quiet club be short and a busy one tall.

                      No cover photograph here, deliberately. The photo is the
                      club page's, and giving the tab the same 5:2 cover made
                      one card a copy of the other one navigation later. The
                      tab is texture; the front door is the picture. */}
                  <Link
                    href={`/club/${club.slug}`}
                    className="block w-full text-center"
                    style={{ backgroundColor: 'var(--cream)', backgroundImage: 'var(--honeycomb)' }}
                  >
                    <span
                      className={`block px-3.5 ${hush ? 'pb-[9px] pt-[10px]' : 'pb-[13px] pt-[14px]'}`}
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(251,247,239,0) 0%, rgba(251,247,239,.86) 44%, var(--paper) 100%)',
                      }}
                    >
                      {/* The paper hex reads as a ~3px rim around the avatar,
                          which is what separates the mark from the texture. */}
                      <span
                        className={`relative mx-auto grid place-items-center bg-paper [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)] ${
                          hush ? 'h-[48px] w-[44px]' : 'h-[66px] w-[60px]'
                        }`}
                      >
                        <HexAvatar name={club.name} src={club.avatar_url} size={hush ? 40 : 54} />
                      </span>
                      <span className="mt-1 flex flex-wrap items-center justify-center gap-[7px]">
                        <span
                          className={`font-display font-bold leading-[1.15] text-ink-900 ${
                            hush ? 'text-[17px]' : 'text-[19px]'
                          }`}
                        >
                          {club.name}
                        </span>
                        {m.role === 'admin' && <Badge tone="admin">admin</Badge>}
                        {m.role === 'organizer' && <Badge>{t('role.organizer')}</Badge>}
                      </span>
                      {/* who, not how many */}
                      <span className="mt-1.5 flex justify-center">
                        <FaceStack people={faces} total={total} size={hush ? 17 : 20} max={4} />
                      </span>
                    </span>
                  </Link>

                  {/* Recent photos, only when there are some. Three empty
                      dashed boxes on a list is the club telling you about a
                      feature instead of about itself. */}
                  {strip.length > 0 && (
                    <div className="px-3.5 pb-3">
                      {/* Fixed 92px tiles that scroll, rather than however
                          many there are sharing one row. Three photos stretched
                          across the card were a filmstrip; six at a set size
                          are a pile you flick through, and the sixth being
                          half off the edge is what says there are more. */}
                      <div
                        className="flex gap-2 overflow-x-auto pb-1"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        {/* Each tile goes to ITS event, not back to the club.
                            Six targets all pointing at the page you are already
                            on is six no-ops, and a photo in Hive always belongs
                            to a night: that is the whole reason it can be
                            captioned. The photograph is content, so it gets a
                            real alt; only the cover above is decorative. */}
                        {strip.map((s, i) => (
                          <Link
                            key={i}
                            href={s.slug ? `/e/${s.slug}` : `/club/${club.slug}`}
                            className="block w-[92px] flex-shrink-0"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={s.url}
                              alt={s.caption ? tf('clubs.photoAlt', { title: s.caption }) : ''}
                              className="block h-[92px] w-[92px] rounded-sm object-cover"
                              style={{ background: 'var(--cream-sunk)' }}
                            />
                            {s.caption && (
                              <span className="mt-[5px] block truncate text-[11.5px] text-ink-500">{s.caption}</span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {footer.kind === 'today' ? (
                    // On the day the address is the whole answer, so it takes
                    // the dark strip and full weight. The time drops to the
                    // line under it: you know it is tonight, you need to know
                    // where to go.
                    <Link
                      href={`/e/${footer.event.slug}`}
                      className="flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left"
                      style={{ background: 'var(--charcoal)' }}
                    >
                      <Icon name="location-dot" size={14} className="flex-shrink-0 text-honey-500" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {/* Where, then what and when. The time has become a
                            place: you already know it is tonight, so the line
                            that gets the weight is the one that gets you
                            there, and the street trails the venue name rather
                            than replacing it. */}
                        <span className="truncate text-[13.5px] font-bold text-on-dark">
                          {footer.event.location ?? footer.event.title}
                          {footer.event.location && footer.event.area ? `, ${footer.event.area}` : ''}
                        </span>
                        <span className="truncate text-[11.5px] text-on-dark-mute">
                          {tf('clubs.todayLine', { title: footer.event.title, window: footer.window })}
                        </span>
                      </span>
                      <Icon name="chevron-right" size={11} className="flex-shrink-0 text-on-dark-mute" />
                    </Link>
                  ) : footer.kind === 'next' ? (
                    (() => {
                      // Soon is decided by the one function that decides it
                      // everywhere, not by re-subtracting dates here, and it
                      // is what turns the row honey and swaps the calendar for
                      // a clock.
                      const soon = whenPill(footer.event.chosen_start, footer.event.status, now, lang)?.soon ?? false
                      return (
                        <Link
                          href={`/e/${footer.event.slug}`}
                          className={`flex min-h-12 w-full items-center gap-2.5 border-t px-3.5 py-2.5 text-left ${
                            soon ? 'border-honey-500 bg-honey-50' : 'border-line-card bg-cream-sunk'
                          }`}
                        >
                          <Icon
                            name={soon ? 'clock' : 'calendar-day'}
                            size={12}
                            className="flex-shrink-0 text-honey-700"
                          />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink-900">
                            {footer.event.title}
                          </span>
                          <WhenPill at={footer.event.chosen_start} />
                          {/* a span, never a start: fmtSpan says "desde" when
                              it has to fall back to one */}
                          {footer.event.chosen_start && (
                            <span className="flex-shrink-0 whitespace-nowrap text-[12.5px] text-ink-500">
                              {fmtSpan(footer.event.chosen_start, footer.event.chosen_end, lang)}
                            </span>
                          )}
                          <Icon name="chevron-right" size={11} className="flex-shrink-0 text-ink-300" />
                        </Link>
                      )
                    })()
                  ) : (
                    // Not a button. There is nothing to open, so the row is a
                    // sentence, and only somebody who could fix it gets the
                    // action beside it.
                    <div
                      className="flex items-center gap-2.5 border-t border-line-card px-3.5 py-1.5"
                      style={{ background: 'var(--cream-sunk)' }}
                    >
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-500">
                        {quietSince(footer.since, lang)}
                      </span>
                      {/* A real button, at a real size. This was a bare link
                          with `-my-2 py-2` inside a 44px row, so about 32px of
                          target against a floor the rest of the app holds, and
                          it is the ONLY action on a brand new club's card: the
                          control somebody needs most on their first day was the
                          hardest one on the screen to hit. The row grows to fit
                          it rather than the other way round. */}
                      {canStart && (
                        <Link href={`/club/${club.slug}/new-event`} className="flex-shrink-0">
                          <Button variant="ghost" size="sm">
                            {t('clubs.newEvent')}
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Its own row, after the list. Creating a club is the rarest thing
              on this screen and the header is its most prominent slot, and you
              decide to start one after looking at the ones you have and not
              finding the one you wanted. Home already puts it here. */}
          <div className="mt-3">
            <CreateClubButton />
          </div>

          {quiet.length > 0 && (
            <section className="mt-6">
              {/* The caption rides the header's action slot rather than
                  labelling each row: it is one fact about the whole group, and
                  repeating "sin nada planeado" down a column of clubs says it
                  four times. */}
              <SectionHeader action={<span className="text-[12px] text-ink-300">{t('clubs.quiet')}</span>}>
                {t('clubs.more')}
              </SectionHeader>
              <div className="flex flex-col gap-[7px]">
                {quiet.map(({ m, club }) => (
                  <Link
                    key={m.club_id}
                    href={`/club/${club.slug}`}
                    className="flex min-h-[46px] items-center gap-[11px] rounded-md border border-line-card bg-paper px-[13px] py-[9px]"
                  >
                    <HexAvatar name={club.name} src={club.avatar_url} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink-900">{club.name}</span>
                    <FaceStack people={facesOf.get(m.club_id) ?? []} total={countOf.get(m.club_id)} size={17} max={3} />
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
