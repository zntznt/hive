import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { EventRow } from '@/lib/types'
import { fmtMoney } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { Icon, MapPinIcon } from '@/components/ui/Icon'
import CopyButton from '@/components/copy-button'
import { BannerUpload } from './banner-upload'
import { AvatarUpload } from './avatar-upload'
import { AboutEditor } from './about-editor'
import { AddCategoryButton, EditCategoryButton } from './category-editor'
import { MemberRow } from './member-row'
import { InviteModal } from './invite-modal'
import { DangerZone } from './danger-zone'
import { updateClubJoinMode, decideChangeRequest, decideJoinRequest, revokeInvitation } from '@/app/actions'
import { AppBar } from '@/components/ui/AppBar'
import { WhenPill, whenPill } from '@/components/ui/WhenPill'
import { SummaryRow, DoorGroup } from '@/components/ui/Density'
import { fmtDayMonth } from '@/lib/time'

type Category = { id: string; name: string; emoji: string | null }
type AttendanceRow = {
  user_id: string
  category_id: string | null
  events_attended: number
  last_attended_at: string
  // how the count was arrived at: recorded by an organizer, or inferred from
  // RSVPs on events that finished before roll call existed
  recorded_events: number
  estimated_events: number
}
type Link_ = { label: string; url: string }

const CHANGE_KIND_LABEL: Record<string, string> = {
  about: 'Acerca de',
  category_add: 'Nueva categoría',
  category_edit: 'Editar categoría',
  category_delete: 'Eliminar categoría',
  banner: 'Portada',
  avatar: 'Foto del club',
  member_removal: 'Quitar miembro',
}

function fmt(d: string | null) {
  return d ? fmtDayMonth(d) : '·'
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ cat?: string }>
}) {
  const { supabase, profile } = await requireProfile()
  const { slug } = await params
  const { cat } = await searchParams

  const { data: club } = await supabase.from('clubs').select('*').eq('slug', slug).maybeSingle()
  if (!club) {
    return (
      <main className="mx-auto max-w-col px-4 pb-6 pt-5">
        <p className="text-ink-700">Este club no existe o todavía no eres miembro. Pide el enlace de invitación.</p>
      </main>
    )
  }

  const [{ data: cats }, { data: evs }, { data: att }, { data: roster }] = await Promise.all([
    supabase.from('event_categories').select('*').eq('club_id', club.id).order('name'),
    supabase.from('events').select('*').eq('club_id', club.id).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('attendance_stats').select('*').eq('club_id', club.id),
    supabase
      .from('club_members')
      .select('user_id, role, joined_at, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
      .eq('club_id', club.id)
      .order('joined_at'),
  ])

  const categories = (cats ?? []) as Category[]
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name
  const events = ((evs ?? []) as EventRow[]).filter((e) => !cat || e.category_id === cat)
  const upcoming = events.filter((e) => !['done', 'cancelled'].includes(e.status))
  const past = events.filter((e) => ['done', 'cancelled'].includes(e.status))

  const attendance = (att ?? []) as AttendanceRow[]
  const attFor = (uid: string) => attendance.find((a) => a.user_id === uid && a.category_id === (cat ?? null))

  const me = (roster ?? []).find((m) => m.user_id === profile.id)
  const isAdmin = me?.role === 'admin' || profile.is_app_admin
  const isOrganizer = me?.role === 'organizer'
  const isManager = isAdmin || isOrganizer
  const adminCount = (roster ?? []).filter((m) => m.role === 'admin').length

  // upcoming-event RSVP counts (going/maybe) for each EvCard's footer row.
  // "van" counts people, so a guest counts too, and only while the member who
  // brought them is seated. Same rule as the event page and as
  // event_seats_taken in the database; a card that says 6 next to an event
  // page that says 8 is the bug 0033 set out to remove.
  const rsvpCountsByEvent = new Map<string, { going: number; maybe: number }>()
  if (upcoming.length > 0) {
    const ids = upcoming.map((e) => e.id)
    const [{ data: rsvpRows }, { data: guestRows }] = await Promise.all([
      supabase.from('rsvps').select('event_id, user_id, status, waitlist_pos').in('event_id', ids),
      supabase.from('guests').select('event_id, host_user_id').in('event_id', ids).is('promoted_to_user_id', null),
    ])
    const seated = new Set<string>()
    for (const r of rsvpRows ?? []) {
      const cur = rsvpCountsByEvent.get(r.event_id) ?? { going: 0, maybe: 0 }
      if (r.status === 'in' && r.waitlist_pos == null) {
        cur.going++
        seated.add(`${r.event_id}:${r.user_id}`)
      } else if (r.status === 'maybe') cur.maybe++
      rsvpCountsByEvent.set(r.event_id, cur)
    }
    for (const g of guestRows ?? []) {
      if (!seated.has(`${g.event_id}:${g.host_user_id}`)) continue
      const cur = rsvpCountsByEvent.get(g.event_id) ?? { going: 0, maybe: 0 }
      cur.going++
      rsvpCountsByEvent.set(g.event_id, cur)
    }
  }

  // past-event "still owed" totals for the history list
  const owedByEvent = new Map<string, number>()
  if (past.length > 0) {
    const { data: pastBal } = await supabase
      .from('event_balances')
      .select('event_id, net_cents')
      .in(
        'event_id',
        past.map((e) => e.id)
      )
      .lt('net_cents', 0)
    for (const r of pastBal ?? []) owedByEvent.set(r.event_id, (owedByEvent.get(r.event_id) ?? 0) - r.net_cents)
  }

  const [{ data: changeReqs }, { data: joinReqs }, { data: pendingInvites }] = isManager
    ? await Promise.all([
        supabase
          .from('change_requests')
          .select('id, kind, payload, created_at, users:requested_by(display_name)')
          .eq('club_id', club.id)
          .eq('status', 'pending')
          .order('created_at'),
        supabase
          .from('club_join_requests')
          .select('id, user_id, created_at, users:user_id(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
          .eq('club_id', club.id)
          .eq('status', 'pending')
          .order('created_at'),
        isAdmin
          ? supabase.from('invitations').select('*').eq('club_id', club.id).is('claimed_by_user_id', null).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  // money still out across this club's events: sum each member's negative
  // event_balances into a per-person outstanding total.
  let owedByMember: { userId: string; user: AvatarUser; cents: number; eventCount: number }[] = []
  if (events.length > 0) {
    const eventIds = events.map((e) => e.id)
    const { data: balRows } = await supabase.from('event_balances').select('event_id, user_id, net_cents').in('event_id', eventIds).lt('net_cents', 0)
    const userOf = new Map((roster ?? []).map((m) => [m.user_id, m.users as unknown as AvatarUser | null]))
    const totals = new Map<string, { cents: number; events: Set<string> }>()
    for (const r of balRows ?? []) {
      const cur = totals.get(r.user_id) ?? { cents: 0, events: new Set<string>() }
      cur.cents += r.net_cents
      cur.events.add(r.event_id)
      totals.set(r.user_id, cur)
    }
    owedByMember = [...totals.entries()]
      .map(([userId, v]) => ({ userId, user: userOf.get(userId) ?? { display_name: '·' }, cents: -v.cents, eventCount: v.events.size }))
      .sort((a, b) => b.cents - a.cents)
  }

  // for member_removal requests filed before the name was stored on the payload
  const memberName = new Map(
    (roster ?? []).map((m) => [
      m.user_id as string,
      (m.users as unknown as { display_name?: string } | null)?.display_name ?? '',
    ])
  )

  const links = (club.links ?? []) as Link_[]

  return (
    <>
      <AppBar
        title={club.name}
        backHref="/clubs"
        action={isManager ? { label: 'Nuevo evento', icon: 'plus', href: `/club/${slug}/new-event` } : undefined}
      />
      <main className="mx-auto w-full max-w-col px-4 pb-6">
      <div className="relative mb-3 mt-1">
        <div
          className="h-[110px] rounded-lg border border-line-card bg-cream bg-center bg-cover"
          style={{ backgroundImage: club.banner_url ? `url(${club.banner_url})` : 'var(--honeycomb)' }}
        />
        {isManager && <BannerUpload clubId={club.id} slug={slug} />}
      </div>

      <header className="mb-4 flex items-center gap-3">
        {isManager ? (
          <AvatarUpload clubId={club.id} slug={slug} clubName={club.name} avatarUrl={club.avatar_url} />
        ) : (
          <HexAvatar name={club.name} size={40} src={club.avatar_url} />
        )}
        <span className="text-xl font-extrabold text-ink-900">{club.name}</span>
      </header>

      <Card className="mb-[18px]">
        <div className="flex items-start justify-between gap-2.5">
          <p className="text-[13.5px] leading-relaxed text-ink-700">{club.description || 'Todavía sin descripción.'}</p>
          {isManager && <AboutEditor clubId={club.id} slug={slug} isAdmin={isAdmin} description={club.description ?? ''} links={links} />}
        </div>
        {links.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.url.startsWith('http') ? l.url : `https://${l.url}`}
                target="_blank"
                rel="noreferrer"
                className="tap inline-flex items-center gap-1.5 rounded-pill bg-cream-sunk px-3 py-1 text-xs font-bold text-honey-700"
              >
                <Icon name="link" size={12} /> {l.label}
              </a>
            ))}
          </div>
        )}
      </Card>

      <nav className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={`/club/${slug}`}>
          <Chip active={!cat}>Todos</Chip>
        </Link>
        {categories.map((c) => (
          <span key={c.id} className="inline-flex items-center">
            <Link href={`/club/${slug}?cat=${c.id}`}>
              <Chip active={cat === c.id}>
                {c.emoji ? `${c.emoji} ` : ''}
                {c.name}
              </Chip>
            </Link>
            {isManager && <EditCategoryButton clubId={club.id} slug={slug} isAdmin={isAdmin} category={c} />}
          </span>
        ))}
        {isManager && <AddCategoryButton clubId={club.id} slug={slug} isAdmin={isAdmin} />}
      </nav>

      {isManager && (
        <p className="mb-[18px]">
          <Link href={`/club/${slug}/new-event`}>
            <Button display icon={<Icon name="plus" size={11} />}>
              Nuevo evento
            </Button>
          </Link>
        </p>
      )}

      <section className="mb-[26px]">
        <SectionHeader>Próximos</SectionHeader>
        {upcoming.length === 0 ? (
          <EmptyState icon="calendar-days" title="Nada en esta categoría todavía." hint={isManager ? 'Empieza algo.' : 'Vuelve pronto.'} />
        ) : (
          <div className="flex flex-col gap-3.5">
            {upcoming.map((e) => (
              <EvCard
                key={e.id}
                e={e}
                catName={catName(e.category_id)}
                counts={rsvpCountsByEvent.get(e.id)}
                today={whenPill(e.chosen_start, e.status)?.label === 'Hoy'}
              />
            ))}
          </div>
        )}
      </section>

      {isManager && (changeReqs ?? []).length > 0 && (
        <>
          <SectionHeader
            action={
              <Link href="/admin" className="inline-flex items-center gap-1 tap text-[12.5px] font-bold text-honey-700">
                Revisar en Admin <Icon name="chevron-right" size={10} />
              </Link>
            }
          >
            Esperando a los admins · {(changeReqs ?? []).length}
          </SectionHeader>
          <div className="mb-6 flex flex-col gap-2">
            {(changeReqs ?? []).map((r) => {
              const requester = r.users as unknown as { display_name: string } | null
              const payload = r.payload as Record<string, string>
              // member_removal carries only a uuid, so without the name on the
              // payload this row read "Quitar miembro" and named nobody
              const summary =
                r.kind === 'member_removal'
                  ? `a ${payload?.display_name || memberName.get(payload?.user_id ?? '') || 'alguien sin nombre'}`
                  : payload?.name
                    ? `"${payload.name}"`
                    : payload?.description
                      ? 'editar descripción y enlaces'
                      : CHANGE_KIND_LABEL[r.kind] ?? r.kind
              return (
                <Card key={r.id} pad="sm" className="border-honey-200 bg-honey-50">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 text-sm font-bold text-ink-900">
                      {CHANGE_KIND_LABEL[r.kind] ?? r.kind} · {requester?.display_name ?? '·'}
                    </span>
                    {isAdmin ? null : (
                      <span className="flex flex-shrink-0 items-center gap-1.5 rounded-pill bg-honey-100 px-[11px] py-[5px] text-[11px] font-bold text-honey-800">
                        pendiente
                      </span>
                    )}
                  </div>
                  <p className="mb-2 text-[12.5px] text-ink-500">{summary}</p>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <form action={decideChangeRequest.bind(null, r.id, slug, false)}>
                        <button className="tap text-[12.5px] font-bold text-ink-500">Rechazar</button>
                      </form>
                      <form action={decideChangeRequest.bind(null, r.id, slug, true)}>
                        <Button size="sm">Aprobar</Button>
                      </form>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Rule 5: a stack of identical cards for a queue you are not going to
          empty here. One row with the faces on it says the same thing and
          leaves the deciding to Admin, which is where it happens. */}
      {isManager && (joinReqs ?? []).length > 0 && !isAdmin && (
        <div className="mb-[26px]">
          <SummaryRow
            icon="clipboard"
            label={`${(joinReqs ?? []).length} ${(joinReqs ?? []).length === 1 ? 'persona quiere entrar' : 'personas quieren entrar'}`}
            meta="en revisión"
            tone="hot"
            faces={(joinReqs ?? []).map((r) => (r.users as unknown as AvatarUser | null) ?? { display_name: '·' })}
            href="/admin"
          />
        </div>
      )}

      {isManager && (joinReqs ?? []).length > 0 && isAdmin && (
        <>
          <SectionHeader
            action={
              <Link href="/admin" className="inline-flex items-center gap-1 tap text-[12.5px] font-bold text-honey-700">
                Revisar en Admin <Icon name="chevron-right" size={10} />
              </Link>
            }
          >
            Solicitudes para unirse · {(joinReqs ?? []).length}
          </SectionHeader>
          <div className="mb-6 flex flex-col gap-2">
            {(joinReqs ?? []).map((r) => {
              const requester = r.users as unknown as AvatarUser | null
              return (
                <Card key={r.id} pad="sm" className="flex items-center justify-between border-honey-200 bg-honey-50">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar user={requester ?? { display_name: '·' }} size={28} />
                    <span className="text-sm text-ink-900">{requester?.display_name ?? '·'}</span>
                  </span>
                  {isAdmin ? (
                    <span className="flex flex-shrink-0 gap-2">
                      <form action={decideJoinRequest.bind(null, r.id, slug, false)}>
                        <button className="tap text-[12.5px] font-bold text-ink-500">Rechazar</button>
                      </form>
                      <form action={decideJoinRequest.bind(null, r.id, slug, true)}>
                        <Button size="sm">Aprobar</Button>
                      </form>
                    </span>
                  ) : (
                    <span className="flex flex-shrink-0 items-center gap-1.5 rounded-pill bg-honey-100 px-[11px] py-[5px] text-[11px] font-bold text-honey-800">
                      pendiente
                    </span>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}

      <SectionHeader action={isManager ? <InviteModal clubId={club.id} slug={slug} clubName={club.name} isAdmin={isAdmin} /> : null}>
        Miembros · {(roster ?? []).length} {cat ? `· asistencia a ${catName(cat)}` : ''}
      </SectionHeader>
      <div className="mb-2 overflow-hidden rounded-lg border border-line-card bg-paper">
        {(roster ?? []).map((m) => (
          <MemberRow
            key={m.user_id}
            clubId={club.id}
            slug={slug}
            userId={m.user_id}
            user={(m.users as unknown as AvatarUser | null) ?? { display_name: '·' }}
            role={m.role}
            isAdmin={isAdmin}
            isOrganizer={isOrganizer}
            isSelf={m.user_id === profile.id}
            lastAttendedAt={attFor(m.user_id)?.last_attended_at ?? null}
            eventsAttended={attFor(m.user_id)?.events_attended ?? 0}
            recordedEvents={attFor(m.user_id)?.recorded_events ?? 0}
            estimatedEvents={attFor(m.user_id)?.estimated_events ?? 0}
          />
        ))}
        {isAdmin &&
          (pendingInvites ?? []).map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-2 border-t border-line-divider px-[13px] py-[11px] text-sm">
              <span className="flex min-w-0 items-center gap-2.5">
                <HexAvatar name={inv.email ?? inv.phone ?? '?'} size={28} />
                <span className="min-w-0 truncate text-ink-500">{inv.email ?? inv.phone}</span>
                {inv.declined_at ? <Badge tone="disabled">no puede</Badge> : <Badge>invitado</Badge>}
              </span>
              <form action={revokeInvitation.bind(null, inv.id, `/club/${slug}`)} className="flex-shrink-0">
                <button className="tap text-[12.5px] font-bold text-ink-500">Revocar</button>
              </form>
            </div>
          ))}
      </div>


      {isAdmin && (
        <section className="mb-[26px]">
          <SectionHeader>Enlace para unirse</SectionHeader>
          <div className="flex items-center justify-between gap-2 rounded-md border border-line-card bg-paper px-[13px] py-[11px] text-sm">
            <span className="truncate text-ink-500">/c/{club.join_token}</span>
            <CopyButton path={`/c/${club.join_token}`} />
          </div>
          <form action={updateClubJoinMode.bind(null, club.id, slug)} className="mt-2 flex items-center gap-2 text-sm">
            <label htmlFor="join_mode" className="text-ink-700">
              Quién puede pedir entrar con el enlace
            </label>
            <select id="join_mode" name="join_mode" defaultValue={club.join_mode} className="rounded-md border border-line-input bg-paper p-1.5 text-xs">
              <option value="invite_only">solo con invitación</option>
              <option value="anyone_with_link">cualquiera con el enlace (pide aprobación)</option>
            </select>
            <button className="tap rounded-md border border-line-input px-2 py-1 text-xs font-bold">Guardar</button>
          </form>
        </section>
      )}

      {isManager && owedByMember.length > 0 && (
        <section className="mb-[26px]">
          <SectionHeader
            action={
              <Link href={`/events?club=${club.id}&owed=true`} className="inline-flex items-center gap-1 tap text-[12.5px] font-bold text-honey-700">
                Ver eventos <Icon name="chevron-right" size={10} />
              </Link>
            }
          >
            Dinero pendiente
          </SectionHeader>
          <div className="overflow-hidden rounded-lg border border-line-card bg-paper">
            {owedByMember.map((o, i) => (
              <Link
                key={o.userId}
                href={`/events?club=${club.id}&owed=true&person=${o.userId}`}
                className={`min-h-11 flex items-center justify-between gap-2 px-[13px] py-[11px] ${i ? 'border-t border-line-divider' : ''}`}
              >
                <span className="flex items-center gap-2.5">
                  <UserAvatar user={o.user} size={28} />
                  <span className="text-sm text-ink-900">{o.user.display_name}</span>
                </span>
                <span className="text-[13px] font-extrabold text-danger">
                  {fmtMoney(o.cents)} <span className="font-semibold text-ink-300">· {o.eventCount} evento{o.eventCount > 1 ? 's' : ''}</span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-300">
            Balances abiertos en los eventos de este club. Toca a alguien para ver en qué eventos sigue debiendo.
          </p>
        </section>
      )}

      {/* Rule 7. The club's own history and its settings were sections of this
          page, indistinguishable from the things people come here for. They
          are doors, and they say so once, under a line. */}
      <DoorGroup label="El club">
        <SummaryRow
          icon="clock-rotate-left"
          label="Eventos pasados"
          meta={past.length ? String(past.length) : 'ninguno todavía'}
          href={`/events?club=${club.id}&when=past`}
        />
      </DoorGroup>

      <SectionHeader>Ajustes del club</SectionHeader>
      <DangerZone clubId={club.id} clubName={club.name} isAdmin={isAdmin} isLastAdmin={isAdmin && adminCount === 1} memberCount={(roster ?? []).length} />
    </main>
    </>
  )
}

// Rule 8, on the club page: tonight's event carries the address and the hour
// at full weight, so this screen alone is enough to get you there. Later
// events stay quiet, which is what makes the loud one mean something.
//
// The cost is two treatments for the same object, and honey normally means
// "this wants an answer from you". Here it means "this is happening in a few
// hours", which is the one other thing worth that much attention.
function EvCard({
  e,
  catName,
  counts,
  today = false,
}: {
  e: EventRow
  catName: string | undefined
  counts: { going: number; maybe: number } | undefined
  today?: boolean
}) {
  const cancelled = e.status === 'cancelled'
  const hot = today && !cancelled
  return (
    <Link
      href={`/e/${e.slug}`}
      className={`block overflow-hidden rounded-lg border shadow-card ${
        hot ? 'border-honey-500 bg-honey-100' : 'border-line-card bg-paper'
      } ${cancelled ? 'opacity-65' : ''}`}
    >
      <div className="flex items-center justify-between gap-2.5 px-3.5 pb-2.5 pt-3.5">
        <span className="font-display text-lg font-bold text-ink-900">{e.title}</span>
        {catName && <Chip variant="sage">{catName}</Chip>}
      </div>
      {/* the map is the quiet card's way of showing where. On the day the
          address itself carries it, so the iframe would just be noise above
          the line that matters. */}
      {e.location && !hot && (
        <iframe
          title={e.title}
          src={`https://www.google.com/maps?q=${encodeURIComponent(e.location)}&z=14&output=embed`}
          className="block h-[110px] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
      <div className="flex items-start justify-between gap-2.5 px-3.5 pb-1.5 pt-2.5">
        <span className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5">
            <MapPinIcon />
          </span>
          <span className={`min-w-0 font-extrabold text-ink-900 ${hot ? 'text-[15px]' : 'text-sm'}`}>
            {e.location || 'sin lugar'}
          </span>
        </span>
        {cancelled ? (
          <Badge tone="disabled">cancelado</Badge>
        ) : (
          <WhenPill at={e.status === 'scheduling' ? null : e.chosen_start} status={e.status} />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3.5 pb-3.5 text-[12.5px] text-ink-700">
        <span>
          <Icon name="calendar-days" size={12} /> {e.status === 'scheduling' ? 'sin fecha aún' : fmt(e.chosen_start)}
        </span>
        <span>
          <Icon name="users" size={12} /> van {counts?.going ?? 0} · quizás {counts?.maybe ?? 0}
        </span>
      </div>
    </Link>
  )
}
