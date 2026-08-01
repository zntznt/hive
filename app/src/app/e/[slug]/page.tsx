import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { Contribution, EventRow, RsvpStatus } from '@/lib/types'
import { addGuest, removeGuest, setRsvp, toggleContribution, removeContribution } from '@/app/actions'
import Grid from './grid'
import Expenses from './expenses'
import Polls from './polls'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Chip } from '@/components/ui/Chip'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { Icon, MapPinIcon } from '@/components/ui/Icon'
import { rsvpButtonClass, rsvpLabel, RSVP_OPTIONS } from '@/components/ui/RsvpToggle'
import { AddContributionButton, EditContributionButton } from './contribution-modal'
import { CoOrganizerButton } from './co-organizer-modal'
import { RequestJoinClubButton } from './request-join-button'
import { ClaimContributionButton, PromoteNextButton } from './claim-modal'
import EventAppBar from './event-app-bar'
import AddToCalendar from './add-to-calendar'
import { siteUrl } from '@/lib/site-url'
import Thread from './thread'
import Photos, { type EventPhoto } from './photos'
import { timeAgo } from '@/lib/relative-time'
import { WhenPill, whenPill } from '@/components/ui/WhenPill'
import { Button } from '@/components/ui/Button'
import { Loud, QuietRow, OpenSection, SummaryRow, FoldedEmpties, DoorGroup, FaceStack, DayBanner } from '@/components/ui/Density'
import { DetailsSheet } from '@/components/ui/DetailsSheet'
import { AddExpenseButton } from './expense-modal'
import { AddPollButton } from './poll-modal'
import { AttendanceSheet, type RollCallPerson } from './attendance-sheet'
import { ClosedReceipt, DuplicatePrompt } from './done-blocks'
import { fmtDateTime, fmtDayMonth, fmtTime } from '@/lib/time'

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

  const { data } = await supabase.from('events').select('*, clubs(id, slug, name, join_mode, join_token)').eq('slug', slug).maybeSingle()
  if (!data) {
    return (
      <main className="mx-auto max-w-col px-4 pb-6 pt-5">
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
    { data: commentRows },
    { data: expenses },
    { data: balances },
    { data: settlements },
    { data: polls },
    { data: category },
    { data: clubMembers },
    { data: pendingJoinReq },
    { data: photoRows },
  ] = await Promise.all([
    supabase
      .from('event_members')
      .select('user_id, role, invite_status, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
      .eq('event_id', event.id),
    supabase.from('rsvps').select('*').eq('event_id', event.id),
    supabase.from('availability').select('user_id, slots').eq('event_id', event.id),
    supabase.from('contributions').select('*').eq('event_id', event.id).order('created_at'),
    supabase.from('guests').select('*').eq('event_id', event.id),
    supabase
      .from('event_comments')
      .select('id, body, created_at, user_id, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true }),
    supabase.from('expenses').select('*').eq('event_id', event.id).order('spent_at'),
    supabase.from('event_balances').select('*').eq('event_id', event.id),
    supabase.from('settlements').select('*').eq('event_id', event.id).order('created_at'),
    supabase
      .from('polls')
      // the relationship has to be named. polls reaches poll_options three
      // ways (the options of a poll, the applied_option_id back reference,
      // and a many to many through votes), so the bare embed is ambiguous and
      // PostgREST answers PGRST201 instead of rows. The whole section then
      // renders "nadie ha preguntado nada todavía" over a poll that exists.
      .select('*, poll_options!poll_options_poll_id_fkey(id, label, sort), votes(option_id, user_id)')
      .eq('event_id', event.id)
      .order('created_at'),
    event.category_id
      ? supabase.from('event_categories').select('name, emoji').eq('id', event.category_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string; emoji: string | null } | null }),
    club
      ? supabase
          .from('club_members')
          .select('user_id, role, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
          .eq('club_id', club.id)
      : Promise.resolve({ data: [] as { user_id: string; role: string; users: AvatarUser | null }[] }),
    club
      ? supabase.from('club_join_requests').select('id').eq('club_id', club.id).eq('user_id', profile.id).eq('status', 'pending').maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null }),
    supabase
      .from('event_photos')
      .select('id, path, uploaded_by, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false }),
  ])

  type MemberUser = AvatarUser
  const userOf = new Map((members ?? []).map((m) => [m.user_id, m.users as unknown as MemberUser | null]))
  const nameOf = new Map((members ?? []).map((m) => [m.user_id, userOf.get(m.user_id)?.display_name ?? '·']))
  const myMembership = (members ?? []).find((m) => m.user_id === profile.id)
  const isOrganizer = event.organizer_user_id === profile.id || myMembership?.role === 'organizer'
  const myRsvp = (rsvps ?? []).find((r) => r.user_id === profile.id)

  const isClubMember = !club || (clubMembers ?? []).some((m) => m.user_id === profile.id)
  // binning an event is an admin's call; an organizer can only ask for it
  const isClubAdmin =
    profile.is_app_admin ||
    (clubMembers ?? []).some((m) => m.user_id === profile.id && m.role === 'admin')
  const isClubGuest = !!club && !isClubMember

  const counts: Record<number, number> = {}
  for (const row of avail ?? []) {
    for (const s of row.slots as number[]) counts[s] = (counts[s] ?? 0) + 1
  }
  const mySlots = ((avail ?? []).find((a) => a.user_id === profile.id)?.slots ?? []) as number[]

  // Painted nothing at all. Someone who saved an empty grid has a row and is
  // not waiting on anything: they answered, the answer was "no time works".
  const painted = new Set((avail ?? []).map((a) => a.user_id as string))
  const waitingOn = (members ?? [])
    .filter((m) => !painted.has(m.user_id))
    .map((m) => ({ id: m.user_id as string, user: (userOf.get(m.user_id) ?? { display_name: '·' }) as AvatarUser }))

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

  // A guest is a person in the room, so they hold a place. This screen used to
  // count only members against capacity and then print the guests next to that
  // number, so ten seats read "van 6 de 10" with twelve people going. Guests
  // count while the member who brought them is seated, the same rule the
  // database uses to decide who fits (event_seats_taken).
  const seatedGuests = confirmed.reduce((n, r) => n + (guestCountByHost.get(r.user_id) ?? 0), 0)
  const seatsTaken = confirmed.length + seatedGuests

  // The roll call list, for a done event. Everyone who said "voy" and every
  // guest they brought, each pre-marked present unless a previous roll call
  // said otherwise, because "everybody came" is the common answer and it
  // should cost the fewest taps.
  const rollCall: RollCallPerson[] = [
    ...confirmed.map((r) => ({
      key: r.user_id as string,
      name: nameOf.get(r.user_id) ?? '·',
      user: (userOf.get(r.user_id) ?? { display_name: nameOf.get(r.user_id) ?? '·' }) as AvatarUser,
      present: r.attended !== false,
    })),
    ...(guests ?? [])
      .filter((g) => !g.promoted_to_user_id && confirmed.some((r) => r.user_id === g.host_user_id))
      .map((g) => ({
        key: g.id as string,
        name: g.name as string,
        user: { display_name: g.name as string } as AvatarUser,
        guestOf: nameOf.get(g.host_user_id) ?? '·',
        present: g.attended !== false,
      })),
  ]

  // The album. The bucket is private, like payment proofs and unlike avatars:
  // a public bucket serves every object to anyone holding the URL and never
  // consults the SELECT policy, which would make "people who can see this
  // event" mean "anyone the link ever reaches". So the row keeps the path and
  // the URL is signed here, per render, for as long as looking at the page
  // plausibly takes. Removal is offered per photo: your own always, anybody's
  // if you organize.
  const photoPaths = (photoRows ?? []).map((p) => p.path as string)
  const { data: signedPhotos } = photoPaths.length
    ? await supabase.storage.from('event-photos').createSignedUrls(photoPaths, 3600)
    : { data: [] as { path?: string | null; signedUrl: string }[] }
  const signedByPath = new Map((signedPhotos ?? []).map((s) => [s.path ?? '', s.signedUrl]))

  const photos: EventPhoto[] = (photoRows ?? [])
    .map((p) => ({
      id: p.id as string,
      url: signedByPath.get(p.path as string) ?? '',
      by: nameOf.get(p.uploaded_by as string) ?? '·',
      byUser: (userOf.get(p.uploaded_by as string) ?? {
        display_name: nameOf.get(p.uploaded_by as string) ?? '·',
      }) as AvatarUser,
      at: p.created_at as string,
      canRemove: p.uploaded_by === profile.id || !!isOrganizer,
    }))
    // a row whose object is gone signs to nothing, and a broken tile says less
    // than no tile
    .filter((p) => p.url)

  const organizers = (members ?? []).filter((m) => m.role === 'organizer')
  const coOrganizerCandidates = (clubMembers ?? [])
    .filter((m) => !organizers.some((o) => o.user_id === m.user_id))
    .map((m) => ({ user_id: m.user_id, user: (m.users as unknown as AvatarUser | null) ?? { display_name: '·' } }))

  // --- the eight density rules need to know three things ---------------------
  //
  // What the page is FOR right now (rule 1, one loud block), whether it is
  // happening today (rule 8, the address comes out of the sheet), and which
  // sections are genuinely empty (rule 6, four rows saying nothing become one
  // line saying it once).

  const iPainted = painted.has(profile.id)
  const unclaimed = contributions.filter((c) => !c.assigned_to)

  // Rule 4: one auto-open thing, nearest deadline only, and it never re-arms.
  // Deterministic beats clever, so this is a fixed order rather than a score.
  const loud: 'availability' | 'rsvp' | 'none' =
    event.status === 'cancelled' || event.deleted_at
      ? 'none'
      : event.status === 'scheduling'
        ? iPainted
          ? 'none'
          : 'availability'
        : event.status === 'scheduled' && !myRsvp
          ? 'rsvp'
          : 'none'

  // Rule 8: on the day, and only on the day. The window opens when the event
  // is today in Mexico City and closes when it is over.
  const isToday =
    event.status === 'scheduled' &&
    !!event.chosen_start &&
    whenPill(event.chosen_start, event.status)?.label === 'Hoy'

  // Expenses and polls are record-keeping: when both are empty they are two
  // headers and two sentences saying nothing, so they fold to one line that
  // keeps both add affordances. The thread is not folded, because it is the
  // only one of the three whose empty state is a composer you can type in.
  const nothingLive = (expenses ?? []).length === 0 && (polls ?? []).length === 0

  // A finished event inverts. While nobody has taken the roll call it is the
  // one thing here that decays, so it keeps the loud slot and the photos sit
  // under it. Once the record exists the slot is free, the photos take the top
  // (on a done event they are why anyone opens the page), and the loud action
  // becomes the question a good night actually raises.
  const isDone = event.status === 'done' && !event.deleted_at
  const rollCallTaken = !!event.attendance_taken_at
  const photosBlock =
    (event.status === 'done' || photos.length > 0) ? (
      <section className="mb-[26px]">
        <OpenSection label="Fotos" meta={photos.length ? String(photos.length) : undefined}>
          <Photos
            eventId={event.id}
            slug={event.slug}
            photos={photos}
            canAdd={!!myMembership && !event.deleted_at}
            reason={
              event.deleted_at
                ? 'Este evento está en la papelera, no se pueden agregar fotos.'
                : 'Solo quien fue al evento puede agregar fotos.'
            }
          />
        </OpenSection>
      </section>
    ) : null

  const dateChip =
    event.status === 'scheduling'
      ? 'Fecha por definir'
      : event.status === 'scheduled' && event.chosen_start
        ? fmtDateTime(event.chosen_start)
        : event.status === 'done'
          ? `celebrado${event.chosen_start ? ' · ' + fmtDayMonth(event.chosen_start) : ''}`
          : event.status === 'cancelled'
            ? 'cancelado'
            : 'borrador'

  return (
    <>
      {/* full-bleed, so it is a sibling of the content column rather than
          inside it */}
      <EventAppBar
        eventId={event.id}
        slug={event.slug}
        title={event.title}
        status={event.status}
        clubName={club?.name}
        clubSlug={club?.slug}
        isOrganizer={isOrganizer}
        isClubAdmin={isClubAdmin}
        isDeleted={!!event.deleted_at}
      />
      <main className="mx-auto w-full max-w-col px-4 pb-6">

      {/* A binned event stays reachable by direct link so it can be brought
          back, and says plainly that it is on its way out. */}
      {event.deleted_at && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-md border border-danger-bg bg-danger-bg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-700">
          <Icon name="trash" size={15} />
          <span>
            Está en la papelera desde {timeAgo(event.deleted_at)}. Se borra solo a los 30 días. Ya no aparece en
            listas, pero se puede recuperar hasta entonces.
          </span>
        </div>
      )}

      {isDone && (
        <ClosedReceipt
          by={event.closed_by ? nameOf.get(event.closed_by as string) ?? null : null}
          on={event.closed_at as string | null}
          held={event.chosen_start}
        />
      )}

      {event.status === 'cancelled' && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-md border border-danger-bg bg-danger-bg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-700">
          <span aria-hidden="true"><Icon name="ban" size={15} /></span>
          <span>
            Este evento se canceló. RSVPs y aportaciones están cerrados, todo lo demás se queda como historial. Se avisó a todos por
            correo y WhatsApp. Los balances abiertos siguen pendientes de liquidar.
          </span>
        </div>
      )}

      {/* Rule 8. For the hours when the only thing you need from this screen
          is how to get there, the address comes out of the details sheet and
          sits at the top at full weight. Nothing is added, it is promoted. */}
      {isToday && event.location && (
        <div className="mb-3.5">
          <DayBanner
            place={event.location}
            note={event.chosen_start ? `Desde las ${fmtTime(event.chosen_start)}` : undefined}
            mapHref={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}`}
          />
        </div>
      )}

      {/* Rule 1. One loud block, answering "what do I do here" before you read
          anything. Rule 4 picks it: nearest deadline, fixed order, and once
          you have answered it goes quiet instead of re-arming. */}
      {loud === 'rsvp' && (
        <div className="mb-3.5">
          <Loud
            title={`${nameOf.get(event.organizer_user_id) ?? 'Quien organiza'} está esperando tu respuesta`}
            body={
              <>
                {event.title}
                {event.chosen_start ? `, ${dateChip}` : ''}. {confirmed.length}{' '}
                {confirmed.length === 1 ? 'persona ya dijo que va' : 'personas ya dijeron que van'}.
              </>
            }
            faces={confirmed.map((r) => userOf.get(r.user_id) ?? { display_name: nameOf.get(r.user_id) ?? '·' })}
          >
            {/* three answers, not two: "quizás" is a state this event can
                display and count, so it has to be one you can enter */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <form action={setRsvp.bind(null, event.id, event.slug, 'in')}>
                  <Button block display>
                    {rsvpLabel('in')}
                  </Button>
                </form>
                <form action={setRsvp.bind(null, event.id, event.slug, 'out')}>
                  <Button block variant="secondary">
                    {rsvpLabel('out')}
                  </Button>
                </form>
              </div>
              <form action={setRsvp.bind(null, event.id, event.slug, 'maybe')}>
                <Button block variant="ghost" size="sm">
                  {rsvpLabel('maybe')}
                </Button>
              </form>
            </div>
          </Loud>
        </div>
      )}

      {loud === 'availability' && (
        <div className="mb-3.5">
          <Loud
            title="Falta que marques cuándo puedes"
            body={
              <>
                Nadie puede fijar la fecha hasta que respondan todos. Faltan {waitingOn.length} de{' '}
                {(members ?? []).length}, y la cuadrícula está abajo.
              </>
            }
            faces={waitingOn.map((w) => w.user)}
          />
        </div>
      )}

      {/* the loud block, after you have answered it. A decision you already
          made should not keep shouting. */}
      {loud === 'none' && event.status === 'scheduled' && myRsvp && !event.deleted_at && (
        <div className="mb-3.5">
          <QuietRow
            action={
              <form action={setRsvp.bind(null, event.id, event.slug, myRsvp.status === 'in' ? 'out' : 'in')}>
                <button className="tap text-[12.5px] font-bold text-honey-700">cambiar</button>
              </form>
            }
          >
            {myRsvp.status === 'in'
              ? myWaitPos >= 0
                ? `Estás en la lista de espera, puesto ${myWaitPos + 1}`
                : `Vas${event.chosen_start ? `, ${dateChip}` : ''}`
              : myRsvp.status === 'maybe'
                ? 'Dijiste que quizás'
                : 'Dijiste que no puedes'}
          </QuietRow>
        </div>
      )}

      <div className="mb-5 overflow-hidden rounded-lg border border-line-card bg-paper shadow-raised">
        <div className="flex items-center justify-between gap-2.5 px-4 pb-3 pt-3.5">
          <span className="font-display text-[22px] font-bold leading-tight text-ink-900">{event.title}</span>
          {category && <Chip variant="sage">{category.emoji ? `${category.emoji} ` : ''}{category.name}</Chip>}
        </div>
        {/* the banner above already carries the address, the hour and the
            route on the day, so repeating them here is noise */}
        {event.location && !isToday && (
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
          <WhenPill at={event.status === 'scheduling' ? null : event.chosen_start} status={event.status} className="flex-shrink-0" />
        </div>
        <div className="flex flex-wrap gap-x-4.5 gap-y-1.5 px-3.5 pb-3 text-[13px] text-ink-700">
          <span><Icon name="calendar-days" size={12} /> {event.status === 'scheduling' ? 'fecha no definida' : dateChip}</span>
          <span>
            {/* seatsTaken, not confirmed.length: this pill sits above a
                "Quién va" block that counts guests, and the two reading
                different numbers for the same question is worse than either
                number being wrong on its own. */}
            <Icon name="users" size={12} /> van {seatsTaken} · quizás {byStatus('maybe').length}
          </span>
        </div>
        {event.location && !isToday && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.location)}`}
            target="_blank"
            rel="noreferrer"
            className="block border-t border-line-divider py-2.5 text-center text-sm font-bold text-honey-700"
          >
            Ver ruta <Icon name="arrow-up-right-from-square" size={10} />
          </a>
        )}
      </div>

      {isClubGuest && (
        <div className="mb-4 rounded-lg border border-honey-200 bg-honey-50 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5">
              <Icon name="hand" size={20} />
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


      {/* The receipt lives on the object it describes. This is what the app
          has instead of a notification log. */}
      {(event.scheduled_at || event.cancelled_at) && (
        <p className="mb-3.5 text-[12px] text-ink-300">
          {event.cancelled_at
            ? `Se canceló ${timeAgo(event.cancelled_at)}. Se avisó a quienes iban.`
            : `${nameOf.get(event.organizer_user_id) ?? 'Quien organiza'} fijó la hora ${timeAgo(event.scheduled_at)}. Se avisó al club.`}
        </p>
      )}

      {event.status === 'scheduling' && event.sched_start_date && event.sched_end_date && (
        <section className="mb-[26px]">
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
              waitingOn={waitingOn}
            />
          </Card>
        </section>
      )}

      {/* Rule 1 again, for the one phase that has its own single job: once the
          event is over, the only thing left that only the organizer can do is
          say who actually turned up. It sits above "Quién va" because it is
          the same question, answered after the fact. */}
      {isDone && rollCallTaken && photosBlock}

      {isDone && isOrganizer && !rollCallTaken && (
        <section className="mb-[26px]">
          <AttendanceSheet
            eventId={event.id}
            slug={event.slug}
            people={rollCall}
            takenAt={event.attendance_taken_at}
            takenBy={null}
          />
        </section>
      )}

      {isDone && !rollCallTaken && photosBlock}

      {/* Only an organizer can start the next one, and only once the record of
          this one exists. Offering it above an untaken roll call would be the
          page asking about the future while the past is still unwritten. */}
      {isDone && rollCallTaken && isOrganizer && (
        <DuplicatePrompt
          eventId={event.id}
          faces={rollCall.filter((p) => p.present).map((p) => p.user)}
          total={rollCall.filter((p) => p.present).length}
          place={event.location}
        />
      )}

      {event.status !== 'scheduling' && event.status !== 'cancelled' && (
        <section className="mb-[26px]">
          <OpenSection
            label="Quién va"
            meta={`${seatsTaken}${event.capacity != null ? ` de ${event.capacity}` : ''}`}
          >
          {/* Faces before names before counts. "6 van" tells you how many;
              seeing that Marta is one of them tells you whether to go. */}
          {confirmed.length > 0 && (
            <div className="flex flex-col gap-2.5 rounded-md border border-line-card bg-paper px-3.5 py-3">
              <FaceStack
                faces={confirmed.map((r) => userOf.get(r.user_id) ?? { display_name: nameOf.get(r.user_id) ?? '·' })}
                size={30}
                max={7}
              />
              <span className="text-[13px] leading-snug text-ink-700">
                {confirmed.map((r) => nameOf.get(r.user_id)).join(', ')}
                {(guests ?? []).filter((g) => !g.promoted_to_user_id).length > 0 &&
                  ` y ${(guests ?? []).filter((g) => !g.promoted_to_user_id).length} invitado${(guests ?? []).filter((g) => !g.promoted_to_user_id).length === 1 ? '' : 's'}`}
              </span>
              {(members ?? []).length - (rsvps ?? []).length > 0 && (
                <span className="text-[12.5px] font-bold text-honey-800">
                  {(members ?? []).length - (rsvps ?? []).length}{' '}
                  {(members ?? []).length - (rsvps ?? []).length === 1 ? 'persona no ha dicho' : 'personas no han dicho'}
                </span>
              )}
            </div>
          )}

          {/* The answer buttons stay for anyone who already answered and wants
              to change it; the loud block above carries the first answer. They
              go entirely once the event is over: an RSVP is a promise about
              something that has not happened, and offering to change one for
              last Thursday invites people to edit history the roll call is the
              actual record of. (Cancelled is already excluded further up.) */}
          {loud === 'none' && !isDone && (
            <div className="flex gap-2">
              {RSVP_OPTIONS.map((o) => (
                <form key={o.v} action={setRsvp.bind(null, event.id, event.slug, o.v)} className="flex-1">
                  <button className={rsvpButtonClass(myRsvp?.status === o.v)}>{o.l}</button>
                </form>
              ))}
            </div>
          )}

          <p className="text-[12.5px] text-ink-500">
            van {seatsTaken}
            {event.capacity != null && `/${event.capacity}`} · no van {byStatus('out').length} · quizás {byStatus('maybe').length}
          </p>


          {event.allow_guests && myRsvp?.status === 'in' && (
            <div className="mt-3 rounded-md bg-cream-sunk px-3 py-2.5">
              {myGuests.map((g) => (
                <form key={g.id} action={removeGuest.bind(null, g.id, event.slug)} className="mb-1.5 flex items-center justify-between gap-2 text-sm last:mb-0">
                  <span className="text-ink-700">+1 · {g.name}</span>
                  <button className="tap text-xs font-bold text-ink-500">quitar</button>
                </form>
              ))}
              {/* the form is hidden rather than left to fail: guests_fit
                  refuses one that does not fit, and a button that always
                  throws is worse than a button that is not there */}
              {event.capacity == null || seatsTaken < event.capacity ? (
                <form action={addGuest.bind(null, event.id, event.slug)} className="flex gap-2">
                  <input name="name" placeholder="Nombre de quien traes" className="flex-1 rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
                  <button className="tap rounded-md bg-honey-500 px-3 py-2 text-xs font-bold text-charcoal">Traer a alguien (+1)</button>
                </form>
              ) : (
                <p className="text-[12.5px] text-ink-500">Ya no hay lugar para traer a alguien más.</p>
              )}
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
          </OpenSection>
        </section>
      )}

      <div className="mb-[26px] flex flex-col gap-2">
      <div className="flex items-baseline gap-2.5 px-0.5">
        <span className="eyebrow">Aportaciones</span>
        {/* the count that matters is what is still unclaimed, and it belongs
            in the header rather than in an empty state under the list */}
        {unclaimed.length > 0 && (
          <span className="text-[11.5px] font-bold text-honey-800">faltan {unclaimed.length}</span>
        )}
        {!isDone && event.status !== 'cancelled' && (
          <span className="ml-auto">
            <AddContributionButton
              eventId={event.id}
              slug={event.slug}
              isOrganizer={!!isOrganizer}
              members={(members ?? []).filter((m) => m.user_id !== profile.id).map((m) => ({ user_id: m.user_id, name: nameOf.get(m.user_id) ?? '·' }))}
            />
          </span>
        )}
      </div>
      {contributions.length === 0 && <p className="text-sm text-ink-500">Nadie trae nada todavía. Estrena la lista.</p>}
      <ul className="flex flex-col gap-2">
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
                        <button aria-label="Quitar" className="tap text-xs text-ink-300">
                          <Icon name="xmark" size={12} />
                        </button>
                      </form>
                      <form action={toggleContribution.bind(null, c.id, event.slug, true)}>
                        <button className="tap text-xs font-bold text-honey-700">hecho</button>
                      </form>
                    </>
                  )}
                  {c.done && (c.assigned_to === profile.id || isOrganizer) && (
                    <form action={toggleContribution.bind(null, c.id, event.slug, false)}>
                      <button className="tap text-xs font-bold text-honey-700">deshacer</button>
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
      </div>

      {/* Rule 6. Two sections each drawing a header and a sentence saying
          nothing become one line saying it once, with both ways to start still
          on the row. */}
      {nothingLive ? (
        <div className="mb-[26px]">
          <FoldedEmpties
            action={
              <span className="flex flex-shrink-0 items-center gap-3">
                <AddExpenseButton
                  eventId={event.id}
                  slug={event.slug}
                  myId={profile.id}
                  members={(members ?? []).map((m) => ({
                    user_id: m.user_id,
                    in: confirmed.some((r) => r.user_id === m.user_id),
                    name: nameOf.get(m.user_id) ?? '·',
                  }))}
                  guests={guests ?? []}
                  nameOf={nameOf}
                />
                <AddPollButton eventId={event.id} slug={event.slug} />
              </span>
            }
          >
            Todavía no hay gastos ni encuestas.
          </FoldedEmpties>
        </div>
      ) : (
        <>
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
        </>
      )}

      <Thread
        eventId={event.id}
        slug={event.slug}
        myId={profile.id}
        isOrganizer={!!isOrganizer}
        comments={(commentRows ?? []).map((c) => ({
          id: c.id as string,
          body: c.body as string,
          created_at: c.created_at as string,
          user_id: c.user_id as string,
          user: (c.users ?? { display_name: '·' }) as unknown as AvatarUser,
        }))}
      />

      {/* Only once there is an evening to have photographed. Before that the
          album is an empty promise taking up a section. */}
      {!isDone && photosBlock}

      {/* Said once, at the bottom, rather than as an empty state on each of
          the two things it is true of. */}
      {isDone && (
        <p className="mb-[26px] flex items-start gap-2 px-0.5 text-[12.5px] leading-relaxed text-ink-300">
          <Icon name="circle" size={4} className="mt-[7px] flex-shrink-0" />
          <span>Los RSVPs y la lista de aportaciones ya están cerrados. Lo demás se queda como historial.</span>
        </p>
      )}

      {isDone && isOrganizer && rollCallTaken && (
        <section className="mb-[26px]">
          <AttendanceSheet
            eventId={event.id}
            slug={event.slug}
            people={rollCall}
            takenAt={event.attendance_taken_at}
            takenBy={nameOf.get((event.closed_by as string) ?? event.organizer_user_id) ?? null}
          />
        </section>
      )}

      {/* Rule 7. These used to be sections of this page, each with its own
          header, sitting between things people actually came for. They are
          doors, so they say so, once, under a line. */}
      <DoorGroup label="En otra parte">
        {club && <SummaryRow icon="hashtag" label={club.name} meta="el club" href={`/club/${club.slug}`} />}
        {club && <SummaryRow icon="clock-rotate-left" label="Otros eventos de este club" href={`/events?club=${club.id}`} />}
        <DetailsSheet>
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Organizadores</span>
            <div className="flex flex-wrap gap-2">
              {organizers.map((o) => (
                <span
                  key={o.user_id}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line-card bg-paper py-[3px] pl-[3px] pr-2.5 text-[12.5px] font-bold text-ink-900"
                >
                  <UserAvatar user={userOf.get(o.user_id) ?? { display_name: nameOf.get(o.user_id) ?? '·' }} size={22} />
                  {nameOf.get(o.user_id)}
                  {o.user_id === event.organizer_user_id && <Badge tone="mine">host</Badge>}
                </span>
              ))}
            </div>
            {isOrganizer && (
              <CoOrganizerButton eventId={event.id} slug={event.slug} candidates={coOrganizerCandidates} />
            )}
          </div>

          {event.status === 'scheduled' && event.chosen_start && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Calendario</span>
              <AddToCalendar
                slug={event.slug}
                title={event.title}
                startIso={event.chosen_start}
                endIso={event.chosen_end}
                location={event.location}
                clubName={club?.name ?? null}
                eventUrl={`${siteUrl()}/e/${event.slug}`}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5 text-[12.5px] text-ink-500">
            <span className="eyebrow text-ink-500">Ficha</span>
            <span>
              <Icon name="globe" size={11} /> Las horas se muestran en Ciudad de México (GMT-6).
            </span>
            <span>
              <Icon name="lock" size={11} />{' '}
              {event.join_policy === 'anyone_with_link'
                ? 'Cualquiera con el enlace puede entrar.'
                : event.join_policy === 'invite_only'
                  ? 'Solo con invitación.'
                  : 'Solo miembros del club.'}
            </span>
            {event.capacity != null && (
              <span>
                <Icon name="users" size={11} /> cupo para {event.capacity}
                {event.waitlist_enabled ? ', con lista de espera' : ''}.
              </span>
            )}
            {event.scheduled_at && (
              <span>
                <Icon name="calendar-check" size={11} />{' '}
                {nameOf.get(event.organizer_user_id) ?? 'Quien organiza'} fijó la hora {timeAgo(event.scheduled_at)}.
              </span>
            )}
          </div>
        </DetailsSheet>
      </DoorGroup>
    </main>
    </>
  )
}
