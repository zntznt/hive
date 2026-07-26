import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { EventRow, RsvpStatus } from '@/lib/types'
import { fmtMoney } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Checkbox } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { MapPinIcon } from '@/components/ui/Icon'

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

function eventDate(e: EventFull): Date | null {
  if (e.chosen_start) return new Date(e.chosen_start)
  if (e.sched_start_date) return new Date(`${e.sched_start_date}T00:00:00`)
  return null
}

function isPastEvent(e: EventFull): boolean {
  const d = eventDate(e)
  return d ? d.getTime() < Date.now() : false
}

function dateLabel(e: EventFull): string {
  if (e.status === 'scheduling') return 'buscando fecha'
  const d = eventDate(e)
  if (!d) return '·'
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
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
  const sp = await searchParams
  const club = sp.club ?? 'all'
  const cat = sp.cat ?? 'all'
  const person = sp.person ?? 'all'
  const when = sp.when ?? 'all'
  const place = sp.place ?? 'all'
  const owedOnly = sp.owed === 'true'
  const sort = sp.sort ?? 'newest'
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
      const past = isPastEvent(e)
      if (when === 'past' && !past) return false
      if (when === 'upcoming' && past) return false
    }
    if (place !== 'all' && e.location !== place) return false
    if (owedOnly && owedShownOf(e.id) <= 0) return false
    return true
  })

  const sortKey = (e: EventFull) => (eventDate(e) ?? new Date(e.created_at)).getTime()
  rows = [...rows].sort((a, b) => {
    if (sort === 'oldest') return sortKey(a) - sortKey(b)
    if (sort === 'owed') return owedShownOf(b.id) - owedShownOf(a.id)
    return sortKey(b) - sortKey(a)
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

  return (
    <main className="mx-auto w-full max-w-lg p-6">
      <header className="mb-1 flex items-baseline justify-between">
        <h1 className="font-display text-xl font-bold text-ink-900">Eventos</h1>
        <Link href="/" className="text-sm text-ink-500 underline">
          inicio
        </Link>
      </header>
      <p className="mb-5 text-[13px] text-ink-500">
        Todos los eventos de tus clubs. Filtra, ordena y toca uno para abrirlo.
      </p>

      <Card pad="md" className="mb-4">
        <form method="get" action="/events" className="space-y-3.5">
          <div className="grid grid-cols-3 gap-2.5">
            <Select label="Club" name="club" defaultValue={club}>
              <option value="all">Todos</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="Categoría" name="cat" defaultValue={cat}>
              <option value="all">Todas</option>
              {categoryNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <Select label="Quién fue" name="person" defaultValue={person}>
              <option value="all">Cualquiera</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === profile.id ? 'Tú' : p.name}
                </option>
              ))}
            </Select>
            <Select label="Cuándo" name="when" defaultValue={when}>
              <option value="all">Cualquier fecha</option>
              <option value="upcoming">Próximos</option>
              <option value="past">Pasados</option>
            </Select>
            <Select label="Lugar" name="place" defaultValue={place}>
              <option value="all">Cualquiera</option>
              {places.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Select label="Ordenar" name="sort" defaultValue={sort}>
              <option value="newest">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="owed">Más se debe</option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Checkbox
              name="owed"
              value="true"
              defaultChecked={owedOnly}
              label="Solo con dinero pendiente"
            />
            <Button type="submit" size="sm">
              Filtrar
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-2.5 flex items-baseline justify-between text-[12.5px] text-ink-500">
        <span>
          {rows.length} evento{rows.length === 1 ? '' : 's'}
        </span>
        {grandTotalOwed > 0 && (
          <span>
            {person === 'all' ? 'pendiente en total' : person === profile.id ? 'todavía debes' : `${personName} todavía debe`}{' '}
            <b className="font-extrabold text-danger">{fmtMoney(grandTotalOwed)}</b>
          </span>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-2.5">
        {shown.length === 0 && (
          <EmptyState icon="search" title="No hay eventos que coincidan." hint="Afloja algún filtro." />
        )}
        {shown.map((e) => {
          const clubInfo = e.club_id ? clubById.get(e.club_id) : undefined
          const category = e.category_id ? catById.get(e.category_id) : undefined
          const catLabel = category ? `${category.emoji ? `${category.emoji} ` : ''}${category.name}` : 'sin categoría'
          const attendees = attendeesOf(e.id)
          const myRsvp = myRsvpOf(e.id)
          const myNet = balancesOf(e.id).find((b) => b.user_id === profile.id)?.net_cents ?? 0
          const owedShown = owedShownOf(e.id)
          const past = isPastEvent(e)

          let statusBadge = null
          if (e.status === 'cancelled') {
            statusBadge = <Badge tone="disabled">cancelado</Badge>
          } else if (myRsvp?.status === 'in' && myRsvp.waitlist_pos != null) {
            statusBadge = <Badge>en espera</Badge>
          } else if (myRsvp?.status === 'in' && past) {
            statusBadge = <Badge tone="active">fuiste</Badge>
          } else if (myRsvp?.status === 'in') {
            statusBadge = <Chip variant="honey">vas</Chip>
          }

          return (
            <div key={e.id} className="relative rounded-lg border border-line-card bg-paper p-4 shadow-card">
              <Link href={`/e/${e.slug}`} className="absolute inset-0 rounded-lg" aria-label={`Ver ${e.title}`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-display text-[16px] font-bold text-ink-900">{e.title}</span>
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
                  <div className="mt-0.5 flex items-center gap-1 text-[12.5px] text-ink-500">
                    <MapPinIcon />
                    <span className="truncate">
                      {e.location ?? 'sin lugar'} · {attendees.length} fueron
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[12.5px] font-bold text-ink-700">{dateLabel(e)}</div>
                  {person !== 'all' ? (
                    owedShown > 0 && (
                      <span
                        className={`mt-1.5 inline-block rounded-pill px-2.5 py-[3px] text-[11px] font-extrabold ${
                          person === profile.id ? 'bg-danger-bg text-danger' : 'bg-honey-100 text-honey-800'
                        }`}
                      >
                        {person === profile.id ? 'debes' : 'debe'} {fmtMoney(owedShown)}
                      </span>
                    )
                  ) : myNet < 0 ? (
                    <span className="mt-1.5 inline-block rounded-pill bg-danger-bg px-2.5 py-[3px] text-[11px] font-extrabold text-danger">
                      debes {fmtMoney(-myNet)}
                    </span>
                  ) : owedShown > 0 ? (
                    <span className="mt-1.5 inline-block rounded-pill bg-honey-100 px-2.5 py-[3px] text-[11px] font-extrabold text-honey-800">
                      se debe {fmtMoney(owedShown)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3.5">
          {clampedPage > 1 ? (
            <Link href={pageHref(clampedPage - 1)} className="text-[12.5px] font-bold text-honey-700">
              ← Anterior
            </Link>
          ) : (
            <span className="text-[12.5px] font-bold text-ink-300">← Anterior</span>
          )}
          <span className="text-[12.5px] font-bold text-ink-500">
            Página {clampedPage} de {totalPages}
          </span>
          {clampedPage < totalPages ? (
            <Link href={pageHref(clampedPage + 1)} className="text-[12.5px] font-bold text-honey-700">
              Siguiente →
            </Link>
          ) : (
            <span className="text-[12.5px] font-bold text-ink-300">Siguiente →</span>
          )}
        </div>
      )}
    </main>
  )
}
