import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { Contribution, EventRow, RsvpStatus } from '@/lib/types'
import {
  addContribution,
  claimContribution,
  setEventStatus,
  setRsvp,
  toggleContribution,
} from '@/app/actions'
import Grid from './grid'
import Expenses from './expenses'
import CopyButton from '@/components/copy-button'

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

  const { data } = await supabase
    .from('events')
    .select('*, clubs(slug)')
    .eq('slug', slug)
    .maybeSingle()
  if (!data) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-stone-600">
          Este evento es solo con invitación (o el enlace no es correcto). Pide a quien organiza
          que te invite.
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
  ] = await Promise.all([
    supabase
      .from('event_members')
      .select('user_id, role, users(display_name)')
      .eq('event_id', event.id),
    supabase.from('rsvps').select('*').eq('event_id', event.id),
    supabase.from('availability').select('user_id, slots').eq('event_id', event.id),
    supabase.from('contributions').select('*').eq('event_id', event.id).order('created_at'),
    supabase.from('guests').select('*').eq('event_id', event.id),
    supabase.from('expenses').select('*').eq('event_id', event.id).order('spent_at'),
    supabase.from('event_balances').select('*').eq('event_id', event.id),
    supabase.from('settlements').select('*').eq('event_id', event.id).order('created_at'),
  ])

  const nameOf = new Map(
    (members ?? []).map((m) => [
      m.user_id,
      (m.users as unknown as { display_name: string } | null)?.display_name ?? '·',
    ])
  )
  const myMembership = (members ?? []).find((m) => m.user_id === profile.id)
  const isOrganizer =
    event.organizer_user_id === profile.id || myMembership?.role === 'organizer'
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

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-stone-800">{event.title}</h1>
        <span className="flex items-center gap-3 text-sm">
          {isOrganizer && (
            <Link href={`/e/${event.slug}/invites`} className="text-amber-700 underline">
              invitar
            </Link>
          )}
          <CopyButton path={`/e/${event.slug}`} label="copiar enlace" />
          {clubSlug && (
            <Link href={`/club/${clubSlug}`} className="text-stone-500 underline">
              club
            </Link>
          )}
        </span>
      </header>
      <p className="mb-3 text-sm text-stone-500">
        {event.status === 'scheduling' && 'buscando fecha. Marca cuándo puedes'}
        {event.status === 'scheduled' &&
          `${new Date(event.chosen_start!).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${event.location ? ` · ${event.location}` : ''}`}
        {event.status === 'done' &&
          `celebrado${event.chosen_start ? ' el ' + new Date(event.chosen_start).toLocaleDateString('es-ES') : ''}`}
        {event.status === 'draft' && 'borrador'}
        {event.status === 'cancelled' && 'cancelado'}
      </p>

      {isOrganizer && (event.status === 'scheduled' || event.status === 'done') && (
        <div className="mb-6 flex gap-2 text-sm">
          {event.status === 'scheduled' && (
            <>
              <form action={setEventStatus.bind(null, event.id, event.slug, 'done')}>
                <button className="rounded-lg border border-stone-300 bg-white px-3 py-1 text-stone-700">
                  Marcar celebrado
                </button>
              </form>
              <form action={setEventStatus.bind(null, event.id, event.slug, 'cancelled')}>
                <button className="rounded-lg border border-stone-300 bg-white px-3 py-1 text-stone-500">
                  Cancelar evento
                </button>
              </form>
            </>
          )}
          {event.status === 'done' && (
            <form action={setEventStatus.bind(null, event.id, event.slug, 'scheduled')}>
              <button className="rounded-lg border border-stone-300 bg-white px-3 py-1 text-stone-500">
                Reabrir
              </button>
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
            {(['in', 'out', 'maybe'] as RsvpStatus[]).map((st) => (
              <form key={st} action={setRsvp.bind(null, event.id, event.slug, st)}>
                <button
                  className={`rounded-xl border px-4 py-2 text-sm font-medium ${
                    myRsvp?.status === st
                      ? 'border-amber-500 bg-amber-100 text-amber-900'
                      : 'border-stone-300 bg-white text-stone-600'
                  }`}
                >
                  {st === 'in' ? 'Voy' : st === 'out' ? 'No voy' : 'Quizás'}
                </button>
              </form>
            ))}
          </div>

          {myRsvp?.status === 'in' && myWaitPos >= 0 && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Estás en lista de espera (puesto {myWaitPos + 1}). Te avisamos si se libera una
              plaza.
            </p>
          )}

          <p className="text-sm text-stone-500">
            van {confirmed.length}
            {event.capacity != null && `/${event.capacity}`} · no van {byStatus('out').length} ·
            quizás {byStatus('maybe').length}
          </p>
          {confirmed.length > 0 && (
            <p className="mt-1 text-sm text-stone-600">
              {confirmed.map((r) => nameOf.get(r.user_id) ?? '·').join(', ')}
            </p>
          )}
          {waitlisted.length > 0 && (
            <p className="mt-1 text-sm text-stone-500">
              <span className="text-stone-400">lista de espera:</span>{' '}
              {waitlisted.map((r) => nameOf.get(r.user_id) ?? '·').join(', ')}
            </p>
          )}
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Aportaciones
        </h2>
        {contributions.length === 0 && (
          <p className="mb-2 text-sm text-stone-500">
            Nadie trae nada todavía. Estrena la lista.
          </p>
        )}
        <ul className="mb-3 space-y-2">
          {contributions.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3 text-sm"
            >
              <span className={c.done ? 'text-stone-400 line-through' : 'text-stone-800'}>
                {c.title}
                {c.qty ? ` · ${c.qty}` : ''}
                {c.kind === 'task' && (
                  <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                    tarea
                  </span>
                )}
              </span>
              {c.assigned_to ? (
                <span className="flex items-center gap-2 text-stone-500">
                  {nameOf.get(c.assigned_to) ?? '·'}
                  {(c.assigned_to === profile.id || isOrganizer) && (
                    <form action={toggleContribution.bind(null, c.id, event.slug, !c.done)}>
                      <button className="text-xs text-amber-700 underline">
                        {c.done ? 'deshacer' : 'hecho'}
                      </button>
                    </form>
                  )}
                </span>
              ) : (
                <form action={claimContribution.bind(null, c.id, event.slug)}>
                  <button className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-medium text-white">
                    Me lo pido
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form
          action={addContribution.bind(null, event.id, event.slug)}
          className="space-y-2 rounded-xl border border-dashed border-stone-300 p-3"
        >
          <div className="flex gap-2">
            <input
              name="title"
              required
              placeholder={isOrganizer ? 'Hace falta…' : 'Yo traigo…'}
              className="w-full rounded-lg border border-stone-300 p-2 text-sm outline-amber-500"
            />
            <input
              name="qty"
              placeholder="cantidad"
              className="w-24 rounded-lg border border-stone-300 p-2 text-sm outline-amber-500"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <select name="kind" className="rounded-lg border border-stone-300 p-2 text-sm">
              <option value="bring">traer algo</option>
              <option value="task">tarea</option>
            </select>
            {isOrganizer && (
              <select
                name="assigned_to"
                className="rounded-lg border border-stone-300 p-2 text-sm"
                defaultValue=""
              >
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
            <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white">
              Añadir
            </button>
          </div>
          {!isOrganizer && (
            <p className="text-xs text-stone-400">
              Te lo apuntas tú. Asignarle algo a alguien más lo hace quien organiza.
            </p>
          )}
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

      <p className="text-xs text-stone-400">Las encuestas llegan pronto.</p>
    </main>
  )
}
