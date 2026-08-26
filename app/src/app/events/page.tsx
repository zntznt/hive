import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { EventRow, RsvpStatus } from '@/lib/types'
import { fmtMoney } from '@/lib/money'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Page, PageHeader } from '@/components/ui/Page'
import { Icon, MapPinIcon } from '@/components/ui/Icon'
import { WhenPill } from '@/components/ui/WhenPill'
import { EventFilters } from './event-filters'
import { isEventDay, hasHappened } from '@/lib/time'
import { getT } from '@/lib/current-lang'

// Cross-club event browser: the single "event viewer" page. Reached from Home,
// Club history, and Plate's "still owed" links via query presets (?club=, ?when=,
// ?owed=). Filters/sort/pagination all live in the URL, so this is a plain
// server component + a GET form - no client JS needed.

type EventFull = EventRow & { created_at: string }
type ClubLite = { id: string; slug: string; name: string }
type CategoryLite = { id: string; club_id: string; name: string; emoji: string | null }
type RsvpRaw = {
  event_id: string
  user_id: string
  status: RsvpStatus
  waitlist_pos: number | null
  users: { display_name: string } | null
}
type BalanceRow = { event_id: string; user_id: string; net_cents: number }

const PER_PAGE = 4
const NIL = '00000000-0000-0000-0000-000000000000'

// Where a row sits in an agenda, which is not the same question as whether it
// already happened. An event still finding a date has no instant to compare
// against, but it does have a week it is aiming at, and that is the right
// place to file it. `hasHappened` in time.ts answers the tense; this only
// answers the order.
function eventDate(e: EventFull): Date | null {
  if (e.chosen_start) return new Date(e.chosen_start)
  if (e.sched_start_date) return new Date(`${e.sched_start_date}T00:00:00`)
  return null
}

function qs(params: Record<string, string | undefined>) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  const str = s.toString()
  return str ? `?${str}` : ''
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    club?: string
    cat?: string
    person?: string
    when?: string
    place?: string
    owed?: string
    sort?: string
    page?: string
  }>
}) {
  const { supabase, profile } = await requireProfile()
  const { t, tf } = await getT()
  const sp = await searchParams
  const club = sp.club ?? 'all'
  const cat = sp.cat ?? 'all'
  const person = sp.person ?? 'all'
  const when = sp.when ?? 'all'
  const place = sp.place ?? 'all'
  const owedOnly = sp.owed === 'true'
  const sort = sp.sort ?? 'agenda'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const { data: memberships } = await supabase
    .from('club_members')
    .select('club_id, clubs(id, slug, name)')
    .eq('user_id', profile.id)

  const clubs = Array.from(
    new Map(
      (memberships ?? [])
        .map((m) => m.clubs as unknown as ClubLite | null)
        .filter((c): c is ClubLite => !!c)
        .map((c) => [c.id, c])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name))
  const clubIds = clubs.map((c) => c.id)
  const clubById = new Map(clubs.map((c) => [c.id, c]))

  const [{ data: catsData }, { data: evsData }] = await Promise.all([
    supabase
      .from('event_categories')
      .select('id, club_id, name, emoji')
      .in('club_id', clubIds.length ? clubIds : [NIL]),
    supabase
      .from('events')
      .select('*')
      .in('club_id', clubIds.length ? clubIds : [NIL])
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const categories = (catsData ?? []) as CategoryLite[]
  const catById = new Map(categories.map((c) => [c.id, c]))
  const events = (evsData ?? []) as EventFull[]
  const eventIds = events.map((e) => e.id)

  const [{ data: rsvpsData }, { data: balancesData }] = await Promise.all([
    supabase
      .from('rsvps')
      .select('event_id, user_id, status, waitlist_pos, users(display_name)')
      .in('event_id', eventIds.length ? eventIds : [NIL]),
    supabase
      .from('event_balances')
      .select('event_id, user_id, net_cents')
      .in('event_id', eventIds.length ? eventIds : [NIL]),
  ])

  const rsvpRows = (rsvpsData ?? []) as unknown as RsvpRaw[]
  const balanceRows = (balancesData ?? []) as BalanceRow[]

  const attendeesOf = (eid: string) => rsvpRows.filter((r) => r.event_id === eid && r.status === 'in')
  const myRsvpOf = (eid: string) => rsvpRows.find((r) => r.event_id === eid && r.user_id === profile.id)
  const balancesOf = (eid: string) => balanceRows.filter((b) => b.event_id === eid)
  const totalOwedOf = (eid: string) => balancesOf(eid).reduce((sum, b) => sum + Math.max(0, b.net_cents), 0)
  // with a person picked, "owed" re-scopes to what that person still owes
  const personOwedOf = (eid: string) =>
    Math.max(0, -(balancesOf(eid).find((b) => b.user_id === person)?.net_cents ?? 0))
  const owedShownOf = (eid: string) => (person === 'all' ? totalOwedOf(eid) : personOwedOf(eid))

  // filter option lists, derived from the full (unfiltered) event set in scope
  const peopleMap = new Map<string, string>()
  for (const r of rsvpRows) if (r.status === 'in') peopleMap.set(r.user_id, r.users?.display_name ?? '·')
  const people = Array.from(peopleMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.id === profile.id ? -1 : b.id === profile.id ? 1 : a.name.localeCompare(b.name)))
  const places = Array.from(new Set(events.map((e) => e.location).filter((l): l is string => !!l))).sort()
  const categoryNames = Array.from(new Set(categories.map((c) => c.name))).sort()

  let rows = events.filter((e) => {
    if (club !== 'all' && e.club_id !== club) return false
    if (cat !== 'all') {
      const cName = e.category_id ? catById.get(e.category_id)?.name : null
      if (cName !== cat) return false
    }
    if (person !== 'all' && !attendeesOf(e.id).some((r) => r.user_id === person)) return false
    if (when !== 'all') {
      const past = hasHappened(e)
      if (when === 'past' && !past) return false
      if (when === 'upcoming' && past) return false
    }
    if (place !== 'all' && e.location !== place) return false
    if (owedOnly && owedShownOf(e.id) <= 0) return false
    return true
  })

  const sortKey = (e: EventFull) => (eventDate(e) ?? new Date(e.created_at)).getTime()
  // Agenda is the default, and it is the order a person opens this tab in:
  // what is still to come, soonest first, then everything that already
  // happened, most recent first. Newest-first put the event furthest into the
  // future at the top and buried tonight's, and there was no way to ask for
  // this order at all.
  rows = [...rows].sort((a, b) => {
    if (sort === 'oldest') return sortKey(a) - sortKey(b)
    if (sort === 'owed') return owedShownOf(b.id) - owedShownOf(a.id)
    if (sort === 'newest') return sortKey(b) - sortKey(a)
    // `hasHappened` is the one that already decides this, here and in the
    // filters above, so agenda order cannot disagree with the "past" chip.
    const pa = hasHappened(a)
    const pb = hasHappened(b)
    if (pa !== pb) return pa ? 1 : -1
    return pa ? sortKey(b) - sortKey(a) : sortKey(a) - sortKey(b)
  })

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const clampedPage = Math.min(page, totalPages)
  const shown = rows.slice((clampedPage - 1) * PER_PAGE, clampedPage * PER_PAGE)
  const grandTotalOwed = rows.reduce((sum, e) => sum + owedShownOf(e.id), 0)
  const personName = person !== 'all' ? (peopleMap.get(person) ?? '·') : null

  const baseParams = {
    club: club !== 'all' ? club : undefined,
    cat: cat !== 'all' ? cat : undefined,
    person: person !== 'all' ? person : undefined,
    when: when !== 'all' ? when : undefined,
    place: place !== 'all' ? place : undefined,
    owed: owedOnly ? 'true' : undefined,
    sort: sort !== 'newest' ? sort : undefined,
  }
  const pageHref = (p: number) => `/events${qs({ ...baseParams, page: p > 1 ? String(p) : undefined })}`
  // One filter changed, page reset. Computed here because the chips are links
  // and a link needs its destination before it renders.
  const withFilter = (key: string, value: string) =>
    `/events${qs({ ...baseParams, [key]: value || undefined, page: undefined })}`
  const opts = (key: string, list: { value: string; label: string }[], none: string) =>
    list.map((o) => ({ ...o, href: withFilter(key, o.value === none ? '' : o.value) }))

  return (
    <Page>
      {/* A lede says what a screen is for, not how to operate it. If a page
          has to explain that a list item is tappable, the problem is the list.
          The "inicio" link that used to sit here was a third way back on a
          screen that already has a tab bar and the phone's own back gesture. */}
      <PageHeader title={t('events.title')} lede={t('events.lede')} />

      <EventFilters
        groups={[
          {
            key: 'club',
            label: t('events.filter.club'),
            none: 'all',
            current: club,
            clearHref: withFilter('club', ''),
            options: opts('club', [{ value: 'all', label: t('events.filter.all') }, ...clubs.map((c) => ({ value: c.id, label: c.name }))], 'all'),
          },
          {
            key: 'cat',
            label: t('events.filter.cat'),
            none: 'all',
            current: cat,
            clearHref: withFilter('cat', ''),
            options: opts('cat', [{ value: 'all', label: t('events.filter.allF') }, ...categoryNames.map((n) => ({ value: n, label: n }))], 'all'),
          },
          {
            key: 'person',
            label: t('events.filter.person'),
            none: 'all',
            current: person,
            clearHref: withFilter('person', ''),
            options: opts(
              'person',
              [
                { value: 'all', label: t('events.filter.anyone') },
                ...people.map((p) => ({ value: p.id, label: p.id === profile.id ? t('events.filter.you') : p.name })),
              ],
              'all'
            ),
          },
          {
            key: 'when',
            label: t('events.filter.when'),
            none: 'all',
            current: when,
            clearHref: withFilter('when', ''),
            options: opts(
              'when',
              [
                { value: 'all', label: t('events.filter.anyDate') },
                { value: 'upcoming', label: t('events.filter.upcoming') },
                { value: 'past', label: t('events.filter.past') },
              ],
              'all'
            ),
          },
          {
            key: 'place',
            label: t('events.filter.place'),
            none: 'all',
            current: place,
            clearHref: withFilter('place', ''),
            options: opts('place', [{ value: 'all', label: t('events.filter.anyone') }, ...places.map((p) => ({ value: p, label: p }))], 'all'),
          },
          {
            key: 'sort',
            label: t('events.filter.sort'),
            none: 'newest',
            current: sort,
            clearHref: withFilter('sort', ''),
            options: opts(
              'sort',
              [
                { value: 'agenda', label: t('events.filter.agenda') },
                { value: 'newest', label: t('events.filter.newest') },
                { value: 'oldest', label: t('events.filter.oldest') },
                { value: 'owed', label: t('events.filter.mostOwed') },
              ],
              'agenda'
            ),
          },
        ]}
        owedOnly={owedOnly}
        owedHref={withFilter('owed', owedOnly ? '' : 'true')}
      />

      <div className="mb-2.5 mt-[26px] flex items-baseline justify-between text-[12.5px] text-ink-500">
        <span>
          {rows.length === 1 ? t('events.count.one') : tf('events.count', { n: rows.length })}
        </span>
        {grandTotalOwed > 0 && (
          <span>
            {person === 'all' ? t('events.owed.total') : person === profile.id ? t('events.owed.you') : tf('events.owed.person', { name: personName ?? '' })}{' '}
            {/* Red is only money *you* owe. Filtered to somebody else, or not
                filtered at all, this is a club's outstanding total and not a
                debt of yours, and colouring it red made every screen carrying
                it read like a bill. */}
            <b className={`font-extrabold ${person === profile.id ? 'text-danger' : 'text-ink-900'}`}>
              {fmtMoney(grandTotalOwed)}
            </b>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {shown.length === 0 && (
          <EmptyState icon="magnifying-glass" title={t('events.empty.title')} hint={t('events.empty.hint')} />
        )}
        {shown.map((e) => {
          const clubInfo = e.club_id ? clubById.get(e.club_id) : undefined
          const category = e.category_id ? catById.get(e.category_id) : undefined
          const catLabel = category ? `${category.emoji ? `${category.emoji} ` : ''}${category.name}` : t('form.category.none')
          const attendees = attendeesOf(e.id)
          const myRsvp = myRsvpOf(e.id)
          const myNet = balancesOf(e.id).find((b) => b.user_id === profile.id)?.net_cents ?? 0
          const owedShown = owedShownOf(e.id)
          const past = hasHappened(e)

          let statusBadge = null
          if (e.status === 'cancelled') {
            statusBadge = <Badge tone="disabled">{t('event.cancelled')}</Badge>
          } else if (myRsvp?.status === 'in' && myRsvp.waitlist_pos != null) {
            statusBadge = <Badge>{t('event.waitlisted')}</Badge>
          } else if (myRsvp?.status === 'in' && past) {
            statusBadge = <Badge tone="active">{t('event.youWent')}</Badge>
          } else if (myRsvp?.status === 'in') {
            statusBadge = <Badge tone="mine">{t('event.youGo')}</Badge>
          }

          // Rule 9: the shape comes from what is on it, not from what it is.
          // Tonight is a card with a honey border; anything else upcoming is a
          // row; a past event that owes nothing is the quietest thing on the
          // page, because it is finished and nobody needs it.
          const tonight = isEventDay(e) && e.status !== 'cancelled'
          const settled = past && owedShown === 0
          return (
            <div
              key={e.id}
              className={`relative rounded-lg bg-paper shadow-card ${
                tonight
                  ? 'border-[1.5px] border-honey-500 p-4'
                  : settled
                    ? 'border border-line-card px-3.5 py-2.5 opacity-[.82]'
                    : 'border border-line-card px-3.5 py-3'
              }`}
            >
              <Link href={`/e/${e.slug}`} className="absolute inset-0 rounded-lg" aria-label={tf('events.see', { title: e.title })} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`truncate font-display font-bold text-ink-900 ${
                        tonight ? 'text-[17px]' : settled ? 'text-[14px]' : 'text-[15.5px]'
                      }`}
                    >
                      {e.title}
                    </span>
                    {statusBadge}
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-500">
                    {clubInfo ? (
                      <Link
                        href={`/club/${clubInfo.slug}`}
                        className="relative z-10 font-bold text-honey-700 hover:underline"
                      >
                        {clubInfo.name}
                      </Link>
                    ) : (
                      <span>·</span>
                    )}{' '}
                    · {catLabel}
                  </div>
                  {/* On the day the street leads: by then the only open
                      question is how to get there. */}
                  <div className="mt-0.5 flex items-center gap-1 text-[12.5px] text-ink-500">
                    <MapPinIcon />
                    <span className={`truncate ${tonight ? 'font-bold text-ink-900' : ''}`}>
                      {(tonight ? (e.area ?? e.location) : e.location) ?? t('events.noPlace')} · {tf('events.went', { n: attendees.length })}
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <WhenPill at={e.status === 'scheduling' ? null : e.chosen_start} status={e.status} />
                  {person !== 'all' ? (
                    owedShown > 0 && (
                      <span
                        className={`mt-1.5 inline-block rounded-pill px-2.5 py-[3px] text-[11px] font-extrabold ${
                          person === profile.id ? 'bg-danger-bg text-danger' : 'bg-honey-100 text-honey-800'
                        }`}
                      >
                        {tf(person === profile.id ? 'money.youOweAmount' : 'money.theyOweAmount', { amount: fmtMoney(owedShown) })}
                      </span>
                    )
                  ) : myNet < 0 ? (
                    <span className="mt-1.5 inline-block rounded-pill bg-danger-bg px-2.5 py-[3px] text-[11px] font-extrabold text-danger">
                      debes {fmtMoney(-myNet)}
                    </span>
                  ) : owedShown > 0 ? (
                    <span className="mt-1.5 inline-block rounded-pill bg-honey-100 px-2.5 py-[3px] text-[11px] font-extrabold text-honey-800">
                      {tf('money.owedAmount', { amount: fmtMoney(owedShown) })}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-[26px] flex items-center justify-center gap-3.5">
          {clampedPage > 1 ? (
            <Link href={pageHref(clampedPage - 1)} className="inline-flex items-center gap-1 tap text-[12.5px] font-bold text-honey-700">
              <Icon name="chevron-left" size={10} /> {t('event.prev')}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-ink-300"><Icon name="chevron-left" size={10} /> {t('event.prev')}</span>
          )}
          <span className="text-[12.5px] font-bold text-ink-500">
            {tf('events.pageOf', { n: clampedPage, total: totalPages })}
          </span>
          {clampedPage < totalPages ? (
            <Link href={pageHref(clampedPage + 1)} className="inline-flex items-center gap-1 tap text-[12.5px] font-bold text-honey-700">
              {t('event.next')} <Icon name="chevron-right" size={10} />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-ink-300">{t('event.next')} <Icon name="chevron-right" size={10} /></span>
          )}
        </div>
      )}
    </Page>
  )
}
