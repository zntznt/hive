import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { Contribution, EventRow, RsvpStatus } from '@/lib/types'
import { addContribution, addGuest, claimContribution, removeGuest, setEventStatus, setRsvp, toggleContribution } from '@/app/actions'
import Grid from './grid'
import Expenses from './expenses'
import Polls from './polls'
import CopyButton from '@/components/copy-button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { rsvpButtonClass, RSVP_OPTIONS } from '@/components/ui/RsvpToggle'

function dayRange(start: string, end: string) {
  // walk in UTC so toISOString() reads the same date we stepped - parsing as
  // local time on a UTC+ server shifted every day back by one (H2).
  const days: string[] = []
  const d = new Date(`${start}T00:00:00Z`)
  const stop = new Date(`${end}T00:00:00Z`)
  while (d <= stop && days.length < 31) {
    days.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return days
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { supabase, profile } = await requireProfile()
  const { slug } = await params

  // join_event is idempotent and enforces join_policy server-side. Always try it
  // (unless already a member) - club members can *see* a club event but aren't
  // event_members until they land here, and without that row every RSVP/
  // availability/contribution write fails "not an event member" (H1).
  const { data: alreadyMember } = await supabase
    .from('event_members')
    .select('event_id, events!inner(slug)')
    .eq('events.slug', slug)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (!alreadyMember) {
    await supabase.rpc('join_event', { event_slug: slug })
  }

  const { data } = await supabase.from('events').select('*, clubs(slug)').eq('slug', slug).maybeSingle()
  if (!data) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-ink-700">
          Este evento es solo con invitación (o el enlace no es correcto). Pide a quien organiza que te invite.
        </p>
      </main>
    )
  }
  const event = data as EventRow
  const clubSlug = (data.clubs as unknown as { slug: string } | null)?.slug

  const [
    { data: members },
    { data: rsvps },
    { data: avail },
    { data: contribs },
    { data: guests },
    { data: expenses },
    { data: balances },
    { data: settlements },
    { data: polls },
  ] = await Promise.all([
    supabase
      .from('event_members')
      .select('user_id, role, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
      .eq('event_id', event.id),
    supabase.from('rsvps').select('*').eq('event_id', event.id),
    supabase.from('availability').select('user_id, slots').eq('event_id', event.id),
    supabase.from('contributions').select('*').eq('event_id', event.id).order('created_at'),
    supabase.from('guests').select('*').eq('event_id', event.id),
    supabase.from('expenses').select('*').eq('event_id', event.id).order('spent_at'),
    supabase.from('event_balances').select('*').eq('event_id', event.id),
    supabase.from('settlements').select('*').eq('event_id', event.id).order('created_at'),
    supabase
      .from('polls')
      .select('*, poll_options(id, label, sort), votes(option_id, user_id)')
      .eq('event_id', event.id)
      .order('created_at'),
  ])

  type MemberUser = AvatarUser
  const userOf = new Map((members ?? []).map((m) => [m.user_id, m.users as unknown as MemberUser | null]))
  const nameOf = new Map((members ?? []).map((m) => [m.user_id, userOf.get(m.user_id)?.display_name ?? '·']))
  const myMembership = (members ?? []).find((m) => m.user_id === profile.id)
  const isOrganizer = event.organizer_user_id === profile.id || myMembership?.role === 'organizer'
  const myRsvp = (rsvps ?? []).find((r) => r.user_id === profile.id)

  const counts: Record<number, number> = {}
  for (const row of avail ?? []) {
    for (const s of row.slots as number[]) counts[s] = (counts[s] ?? 0) + 1
  }
  const mySlots = ((avail ?? []).find((a) => a.user_id === profile.id)?.slots ?? []) as number[]

  const contributions = (contribs ?? []) as Contribution[]
  const byStatus = (st: RsvpStatus) => (rsvps ?? []).filter((r) => r.status === st)
  // confirmed = "in" with no waitlist position; waitlisted = "in" parked behind capacity
  const confirmed = byStatus('in').filter((r) => r.waitlist_pos == null)
  const waitlisted = byStatus('in')
    .filter((r) => r.waitlist_pos != null)
    .sort((a, b) => (a.waitlist_pos ?? 0) - (b.waitlist_pos ?? 0))
  const myWaitPos = waitlisted.findIndex((r) => r.user_id === profile.id)
  const myGuests = (guests ?? []).filter((g) => g.host_user_id === profile.id && !g.promoted_to_user_id)

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-bold text-ink-900">{event.title}</h1>
        <span className="flex items-center gap-3 text-sm">
          {isOrganizer && (
            <Link href={`/e/${event.slug}/invites`} className="font-bold text-honey-700">
              invitar
            </Link>
          )}
          <CopyButton path={`/e/${event.slug}`} label="copiar enlace" />
          {clubSlug && (
            <Link href={`/club/${clubSlug}`} className="text-ink-500">
              club
            </Link>
          )}
        </span>
      </header>
      <p className="mb-3.5 text-sm text-ink-500">
        {event.status === 'scheduling' && 'buscando fecha. Marca cuándo puedes'}
        {event.status === 'scheduled' &&
          `${new Date(event.chosen_start!).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${event.location ? ` · ${event.location}` : ''}`}
        {event.status === 'done' && `celebrado${event.chosen_start ? ' el ' + new Date(event.chosen_start).toLocaleDateString('es-ES') : ''}`}
        {event.status === 'draft' && 'borrador'}
        {event.status === 'cancelled' && 'cancelado'}
      </p>

      {isOrganizer && (event.status === 'scheduled' || event.status === 'done') && (
        <div className="mb-6 flex gap-2">
          {event.status === 'scheduled' && (
            <>
              <form action={setEventStatus.bind(null, event.id, event.slug, 'done')}>
                <Button variant="secondary" size="sm">
                  Marcar celebrado
                </Button>
              </form>
              <form action={setEventStatus.bind(null, event.id, event.slug, 'cancelled')}>
                <Button variant="secondary" size="sm">
                  Cancelar evento
                </Button>
              </form>
            </>
          )}
          {event.status === 'done' && (
            <form action={setEventStatus.bind(null, event.id, event.slug, 'scheduled')}>
              <Button variant="secondary" size="sm">
                Reabrir
              </Button>
            </form>
          )}
        </div>
      )}

      {event.status === 'scheduling' && event.sched_start_date && event.sched_end_date && (
        <section className="mb-8">
          <Grid
            eventId={event.id}
            slug={event.slug}
            days={dayRange(event.sched_start_date, event.sched_end_date)}
            timeMin={event.sched_time_min}
            timeMax={event.sched_time_max}
            slotMinutes={event.sched_slot_minutes}
            initialSlots={mySlots}
            counts={counts}
            totalMembers={(members ?? []).length}
            isOrganizer={!!isOrganizer}
          />
        </section>
      )}

      {event.status !== 'scheduling' && event.status !== 'cancelled' && (
        <section className="mb-8">
          <div className="mb-3 flex gap-2">
            {RSVP_OPTIONS.map((o) => (
              <form key={o.v} action={setRsvp.bind(null, event.id, event.slug, o.v)} className="flex-1">
                <button className={rsvpButtonClass(myRsvp?.status === o.v)}>{o.l}</button>
              </form>
            ))}
          </div>

          {myRsvp?.status === 'in' && myWaitPos >= 0 && (
            <p className="mb-2 rounded-md bg-honey-50 px-3 py-2 text-sm text-honey-900">
              Estás en lista de espera (puesto {myWaitPos + 1}). Te avisamos si se libera una plaza.
            </p>
          )}

          {event.allow_guests && myRsvp?.status === 'in' && (
            <div className="mb-3 rounded-md bg-cream-sunk px-3 py-2.5">
              {myGuests.map((g) => (
                <form key={g.id} action={removeGuest.bind(null, g.id, event.slug)} className="mb-1.5 flex items-center justify-between gap-2 text-sm last:mb-0">
                  <span className="text-ink-700">+1 · {g.name}</span>
                  <button className="text-xs font-bold text-ink-500">quitar</button>
                </form>
              ))}
              <form action={addGuest.bind(null, event.id, event.slug)} className="flex gap-2">
                <input name="name" placeholder="Nombre de quien traes" className="flex-1 rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
                <button className="rounded-md bg-honey-500 px-3 py-2 text-xs font-bold text-charcoal">Traer a alguien (+1)</button>
              </form>
            </div>
          )}

          <p className="text-sm text-ink-500">
            van {confirmed.length}
            {event.capacity != null && `/${event.capacity}`} · no van {byStatus('out').length} · quizás {byStatus('maybe').length}
          </p>

          {confirmed.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {confirmed.map((r) => {
                const u = userOf.get(r.user_id)
                return (
                  <span key={r.user_id} title={nameOf.get(r.user_id)} className="flex flex-col items-center gap-1">
                    <UserAvatar user={u ?? { display_name: nameOf.get(r.user_id) ?? '·' }} size={34} />
                    <span className="max-w-[52px] truncate text-[10.5px] text-ink-500">{nameOf.get(r.user_id)}</span>
                  </span>
                )
              })}
            </div>
          )}
          {waitlisted.length > 0 && (
            <p className="mt-2.5 text-sm text-ink-500">
              <span className="text-ink-300">lista de espera:</span> {waitlisted.map((r) => nameOf.get(r.user_id) ?? '·').join(', ')}
            </p>
          )}
        </section>
      )}

      <section className="mb-8">
        <SectionHeader>Aportaciones</SectionHeader>
        {contributions.length === 0 && <p className="mb-2 text-sm text-ink-500">Nadie trae nada todavía. Estrena la lista.</p>}
        <ul className="mb-3 flex flex-col gap-2">
          {contributions.map((c) => (
            <li key={c.id}>
              <Card pad="sm" className="flex items-center justify-between text-sm">
                <span className={c.done ? 'text-ink-300 line-through' : 'text-ink-900'}>
                  {c.title}
                  {c.qty ? ` · ${c.qty}` : ''}
                  {c.kind === 'task' && <Badge className="ml-2">tarea</Badge>}
                </span>
                {c.assigned_to ? (
                  <span className="flex items-center gap-2 text-ink-500">
                    {nameOf.get(c.assigned_to) ?? '·'}
                    {(c.assigned_to === profile.id || isOrganizer) && (
                      <form action={toggleContribution.bind(null, c.id, event.slug, !c.done)}>
                        <button className="text-xs font-bold text-honey-700">{c.done ? 'deshacer' : 'hecho'}</button>
                      </form>
                    )}
                  </span>
                ) : (
                  <form action={claimContribution.bind(null, c.id, event.slug)}>
                    <Button size="sm">Me lo pido</Button>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
        <form action={addContribution.bind(null, event.id, event.slug)} className="flex flex-col gap-2 rounded-lg border-[1.5px] border-dashed border-line-input p-3">
          <div className="flex gap-2">
            <input
              name="title"
              required
              placeholder={isOrganizer ? 'Hace falta…' : 'Yo traigo…'}
              className="w-full rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900"
            />
            <input name="qty" placeholder="cantidad" className="w-24 rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <select name="kind" className="rounded-md border border-line-input bg-paper p-2 text-sm">
              <option value="bring">traer algo</option>
              <option value="task">tarea</option>
            </select>
            {isOrganizer && (
              <select name="assigned_to" className="rounded-md border border-line-input bg-paper p-2 text-sm" defaultValue="">
                <option value="">para mí</option>
                <option value="open">abierto (que alguien se lo pida)</option>
                {(members ?? [])
                  .filter((m) => m.user_id !== profile.id)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      asignar a {nameOf.get(m.user_id)}
                    </option>
                  ))}
              </select>
            )}
            <Button size="sm">Añadir</Button>
          </div>
          {!isOrganizer && <p className="text-xs text-ink-300">Te lo apuntas tú. Asignarle algo a alguien más lo hace quien organiza.</p>}
        </form>
      </section>

      <Expenses
        eventId={event.id}
        slug={event.slug}
        myId={profile.id}
        isOrganizer={!!isOrganizer}
        nameOf={nameOf}
        members={(members ?? []).map((m) => ({
          user_id: m.user_id,
          in: confirmed.some((r) => r.user_id === m.user_id),
        }))}
        guests={guests ?? []}
        expenses={expenses ?? []}
        balances={balances ?? []}
        settlements={settlements ?? []}
      />

      <Polls eventId={event.id} slug={event.slug} myId={profile.id} isOrganizer={!!isOrganizer} nameOf={nameOf} polls={(polls ?? []) as never} />
    </main>
  )
}
