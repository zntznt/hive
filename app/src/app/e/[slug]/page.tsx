import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { Contribution, EventRow, RsvpStatus } from '@/lib/types'
import { addGuest, removeGuest, setEventStatus, setRsvp, toggleContribution, removeContribution } from '@/app/actions'
import Grid from './grid'
import Expenses from './expenses'
import Polls from './polls'
import CopyButton from '@/components/copy-button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { MapPinIcon } from '@/components/ui/Icon'
import { rsvpButtonClass, RSVP_OPTIONS } from '@/components/ui/RsvpToggle'
import { AddContributionButton, EditContributionButton } from './contribution-modal'
import { CoOrganizerButton } from './co-organizer-modal'
import { RequestJoinClubButton } from './request-join-button'
import { ClaimContributionButton, PromoteNextButton } from './claim-modal'

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

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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

  const { data } = await supabase.from('events').select('*, clubs(id, slug, name, join_mode, join_token)').eq('slug', slug).maybeSingle()
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
  const club = data.clubs as unknown as { id: string; slug: string; name: string; join_mode: string; join_token: string } | null

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
    { data: category },
    { data: clubMembers },
    { data: pendingJoinReq },
  ] = await Promise.all([
    supabase
      .from('event_members')
      .select('user_id, role, invite_status, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
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
    event.category_id
      ? supabase.from('event_categories').select('name, emoji').eq('id', event.category_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string; emoji: string | null } | null }),
    club
      ? supabase
          .from('club_members')
          .select('user_id, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
          .eq('club_id', club.id)
      : Promise.resolve({ data: [] as { user_id: string; users: AvatarUser | null }[] }),
    club
      ? supabase.from('club_join_requests').select('id').eq('club_id', club.id).eq('user_id', profile.id).eq('status', 'pending').maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null }),
  ])

  type MemberUser = AvatarUser
  const userOf = new Map((members ?? []).map((m) => [m.user_id, m.users as unknown as MemberUser | null]))
  const nameOf = new Map((members ?? []).map((m) => [m.user_id, userOf.get(m.user_id)?.display_name ?? '·']))
  const myMembership = (members ?? []).find((m) => m.user_id === profile.id)
  const isOrganizer = event.organizer_user_id === profile.id || myMembership?.role === 'organizer'
  const myRsvp = (rsvps ?? []).find((r) => r.user_id === profile.id)

  const isClubMember = !club || (clubMembers ?? []).some((m) => m.user_id === profile.id)
  const isClubGuest = !!club && !isClubMember

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

  // +N badge on each attendee pill: how many unpromoted guests they bring
  const guestCountByHost = new Map<string, number>()
  for (const g of guests ?? []) {
    if (!g.promoted_to_user_id) guestCountByHost.set(g.host_user_id, (guestCountByHost.get(g.host_user_id) ?? 0) + 1)
  }

  const organizers = (members ?? []).filter((m) => m.role === 'organizer')
  const coOrganizerCandidates = (clubMembers ?? [])
    .filter((m) => !organizers.some((o) => o.user_id === m.user_id))
    .map((m) => ({ user_id: m.user_id, user: (m.users as unknown as AvatarUser | null) ?? { display_name: '·' } }))

  const dateChip =
    event.status === 'scheduling'
      ? 'Fecha por definir'
      : event.status === 'scheduled' && event.chosen_start
        ? fmtDateTime(event.chosen_start)
        : event.status === 'done'
          ? `celebrado${event.chosen_start ? ' · ' + new Date(event.chosen_start).toLocaleDateString('es-ES') : ''}`
          : event.status === 'cancelled'
            ? 'cancelado'
            : 'borrador'

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <div className="mb-2.5 flex justify-end gap-3 text-sm">
        {isOrganizer && event.status !== 'cancelled' && (
          <Link href={`/e/${event.slug}/edit`} className="font-bold text-honey-700">
            editar
          </Link>
        )}
        {isOrganizer && (
          <Link href={`/e/${event.slug}/invites`} className="font-bold text-honey-700">
            invitar
          </Link>
        )}
        <CopyButton path={`/e/${event.slug}`} label="copiar enlace" />
        {club && (
          <Link href={`/club/${club.slug}`} className="text-ink-500">
            {club.name}
          </Link>
        )}
      </div>

      {event.status === 'cancelled' && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-md border border-danger-bg bg-danger-bg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-700">
          <span aria-hidden="true">🚫</span>
          <span>
            Este evento se canceló. RSVPs y aportaciones están cerrados, todo lo demás se queda como historial. Se avisó a todos por
            correo y WhatsApp. Los balances abiertos siguen pendientes de liquidar.
          </span>
        </div>
      )}

      <div className="mb-5 overflow-hidden rounded-lg border border-line-card bg-paper shadow-raised">
        <div className="flex items-center justify-between gap-2.5 px-4 pb-3 pt-3.5">
          <span className="font-display text-[22px] font-bold leading-tight text-ink-900">{event.title}</span>
          {category && <Chip variant="sage">{category.emoji ? `${category.emoji} ` : ''}{category.name}</Chip>}
        </div>
        {event.location && (
          <iframe
            title="mapa"
            src={`https://www.google.com/maps?q=${encodeURIComponent(event.location)}&z=15&output=embed`}
            className="block h-[150px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}
        <div className="flex items-start justify-between gap-2.5 px-3.5 pb-2.5 pt-3">
          {event.location ? (
            <span className="flex min-w-0 items-start gap-2">
              <MapPinIcon size={15} />
              <span className="text-[15px] font-extrabold text-ink-900">{event.location}</span>
            </span>
          ) : (
            <span className="text-sm text-ink-300">Sin lugar todavía</span>
          )}
          <Chip variant="honey" className="flex-shrink-0">
            {dateChip}
          </Chip>
        </div>
        <div className="flex flex-wrap gap-x-4.5 gap-y-1.5 px-3.5 pb-3 text-[13px] text-ink-700">
          <span>📅 {event.status === 'scheduling' ? 'fecha no definida' : dateChip}</span>
          <span>
            👥 van {confirmed.length} · quizás {byStatus('maybe').length}
          </span>
        </div>
        {event.location && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}`}
            target="_blank"
            rel="noreferrer"
            className="block border-t border-line-divider py-2.5 text-center text-sm font-bold text-honey-700"
          >
            Ver ruta →
          </a>
        )}
      </div>

      {isClubGuest && (
        <div className="mb-4 rounded-lg border border-honey-200 bg-honey-50 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5">
              👋
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-ink-900">
                Estás aquí como invitado de{' '}
                <Link href={`/club/${club!.slug}`} className="text-honey-700">
                  {club!.name}
                </Link>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-700">
                {pendingJoinReq
                  ? 'Ya pediste unirte. Un organizador o admin te va a dejar entrar pronto.'
                  : club!.join_mode === 'anyone_with_link'
                    ? 'Puedes confirmar y aportar aquí. ¿Quieres también el resto de eventos del club?'
                    : 'Puedes confirmar y aportar en este evento aunque no seas del club.'}
              </p>
            </div>
            {club!.join_mode === 'anyone_with_link' &&
              (pendingJoinReq ? (
                <Badge tone="pending">pendiente</Badge>
              ) : (
                <RequestJoinClubButton joinToken={club!.join_token} />
              ))}
          </div>
        </div>
      )}

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
          <p className="mb-2.5 text-sm text-ink-500">Seguimos buscando fecha. Marca cuándo puedes abajo.</p>
          <Card>
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
          </Card>
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

          {myRsvp?.status === 'in' && myWaitPos < 0 && (
            <p className="mb-2 text-[13px] text-ink-500">Vas. ¡Nos vemos ahí!</p>
          )}

          <p className="text-sm text-ink-500">
            van {confirmed.length}
            {event.capacity != null && `/${event.capacity}`} · no van {byStatus('out').length} · quizás {byStatus('maybe').length}
          </p>

          {confirmed.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {confirmed.map((r) => {
                const u = userOf.get(r.user_id)
                const plus = guestCountByHost.get(r.user_id) ?? 0
                return (
                  <Link
                    key={r.user_id}
                    href={`/events?person=${r.user_id}`}
                    title={`Ver eventos de ${nameOf.get(r.user_id)}`}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line-card bg-paper py-[3px] pl-[3px] pr-2.5 text-[12.5px] font-bold text-ink-900"
                  >
                    <UserAvatar user={u ?? { display_name: nameOf.get(r.user_id) ?? '·' }} size={22} />
                    {nameOf.get(r.user_id)}
                    {plus > 0 && (
                      <span className="rounded-full bg-honey-100 px-[7px] py-px text-[10.5px] text-honey-800">+{plus}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}

          {event.allow_guests && myRsvp?.status === 'in' && (
            <div className="mt-3 rounded-md bg-cream-sunk px-3 py-2.5">
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

          {myRsvp?.status === 'in' && myWaitPos >= 0 && (
            <p className="mt-3 rounded-md bg-honey-50 px-3 py-2 text-sm text-honey-900">
              Estás en lista de espera (puesto {myWaitPos + 1}). Te avisamos si se libera una plaza.
            </p>
          )}

          {waitlisted.length > 0 && (
            <div className="mt-3 rounded-md border border-line-card bg-paper p-3.5">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Lista de espera · {waitlisted.length}</div>
              <div className="flex flex-col gap-1.5">
                {waitlisted.map((r, i) => (
                  <div key={r.user_id} className="flex items-center gap-2 text-sm text-ink-700">
                    <span className="grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full bg-cream-sunk text-[10.5px] font-extrabold text-ink-500">
                      {i + 1}
                    </span>
                    <UserAvatar user={userOf.get(r.user_id) ?? { display_name: nameOf.get(r.user_id) ?? '·' }} size={20} />
                    {nameOf.get(r.user_id)}
                  </div>
                ))}
              </div>
              {isOrganizer && waitlisted.length > 0 && (
                <div className="mt-2.5">
                  <PromoteNextButton eventId={event.id} slug={event.slug} nextName={nameOf.get(waitlisted[0].user_id) ?? '·'} />
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-ink-300">Cuando se libera una plaza, el primero en la fila entra solo y le avisamos por correo y WhatsApp.</p>
            </div>
          )}
        </section>
      )}

      <SectionHeader action={isOrganizer ? <CoOrganizerButton eventId={event.id} slug={event.slug} candidates={coOrganizerCandidates} /> : null}>
        Organizadores
      </SectionHeader>
      <div className="mb-8 flex flex-wrap gap-2">
        {organizers.map((o) => {
          const u = userOf.get(o.user_id)
          return (
            <span key={o.user_id} className="inline-flex items-center gap-1.5 rounded-pill border border-line-card bg-paper py-[3px] pl-[3px] pr-2.5 text-[12.5px] font-bold text-ink-900">
              <UserAvatar user={u ?? { display_name: nameOf.get(o.user_id) ?? '·' }} size={22} />
              {nameOf.get(o.user_id)}
              {o.user_id === event.organizer_user_id && <Badge tone="admin">host</Badge>}
            </span>
          )
        })}
      </div>

      <SectionHeader
        action={
          <AddContributionButton
            eventId={event.id}
            slug={event.slug}
            isOrganizer={!!isOrganizer}
            members={(members ?? []).filter((m) => m.user_id !== profile.id).map((m) => ({ user_id: m.user_id, name: nameOf.get(m.user_id) ?? '·' }))}
          />
        }
      >
        Aportaciones
      </SectionHeader>
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
                  {c.assigned_to === profile.id ? 'tú' : (nameOf.get(c.assigned_to) ?? '·')}
                  {(c.assigned_to === profile.id || isOrganizer) && !c.done && (
                    <>
                      <EditContributionButton id={c.id} slug={event.slug} title={c.title} qty={c.qty} />
                      <form action={removeContribution.bind(null, c.id, event.slug)}>
                        <button aria-label="Quitar" className="text-xs text-ink-300">
                          ✕
                        </button>
                      </form>
                      <form action={toggleContribution.bind(null, c.id, event.slug, true)}>
                        <button className="text-xs font-bold text-honey-700">hecho</button>
                      </form>
                    </>
                  )}
                  {c.done && (c.assigned_to === profile.id || isOrganizer) && (
                    <form action={toggleContribution.bind(null, c.id, event.slug, false)}>
                      <button className="text-xs font-bold text-honey-700">deshacer</button>
                    </form>
                  )}
                </span>
              ) : (
                <ClaimContributionButton id={c.id} slug={event.slug} title={c.title} eventTitle={event.title} />
              )}
            </Card>
          </li>
        ))}
      </ul>
      {contributions.some((c) => !c.assigned_to) && (
        <div className="mb-8">
          <EmptyState
            emoji="🍯"
            title="Casi cubierto."
            hint={`${contributions.filter((c) => !c.assigned_to).length} cosa${contributions.filter((c) => !c.assigned_to).length === 1 ? '' : 's'} sin pedir todavía. Agarra una arriba.`}
          />
        </div>
      )}

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
