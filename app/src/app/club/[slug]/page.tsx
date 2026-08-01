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
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { Icon, MapPinIcon } from '@/components/ui/Icon'
import { BannerUpload } from './banner-upload'
import { AvatarUpload } from './avatar-upload'
import { AboutEditor } from './about-editor'
import { AddCategoryButton, EditCategoryButton } from './category-editor'
import { CalendarSubscribe } from './calendar-subscribe'
import { ClubHeader } from './club-header'
import { FaceStack } from '@/components/ui/FaceStack'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { attendanceLine, type MyRsvp } from '@/lib/event-line'
import { decideChangeRequest, decideJoinRequest } from '@/app/actions'
import { ClubBar } from './club-bar'
import { WhenPill, whenPill } from '@/components/ui/WhenPill'
import { SummaryRow, DoorGroup } from '@/components/ui/Density'
import { siteUrl } from '@/lib/site-url'

type Category = { id: string; name: string; emoji: string | null }
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

  const [{ data: cats }, { data: evs }, { data: roster }] = await Promise.all([
    supabase.from('event_categories').select('*').eq('club_id', club.id).order('name'),
    supabase.from('events').select('*').eq('club_id', club.id).is('deleted_at', null).order('created_at', { ascending: false }),
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

  const me = (roster ?? []).find((m) => m.user_id === profile.id)
  const isAdmin = me?.role === 'admin' || profile.is_app_admin
  const isOrganizer = me?.role === 'organizer'
  const isManager = isAdmin || isOrganizer
  const adminCount = (roster ?? []).filter((m) => m.role === 'admin').length
  const myRole = me?.role ?? 'member'

  // Who is in this club, for the header and the members door. Faces, not a
  // count: "12 miembros" is a fact nobody pictures.
  const rosterFaces = (roster ?? [])
    .map((m) => m.users as unknown as AvatarUser | null)
    .filter((u): u is AvatarUser => !!u)

  // The page knows what day it is. An event today folds the header and hands
  // the top of the page to the address.
  const hasEventToday = ((evs ?? []) as EventRow[])
    .filter((e) => !['done', 'cancelled'].includes(e.status))
    .some((e) => whenPill(e.chosen_start, e.status)?.label === 'Hoy')

  // upcoming-event RSVP counts (going/maybe) for each EvCard's footer row.
  // "van" counts people, so a guest counts too, and only while the member who
  // brought them is seated. Same rule as the event page and as
  // event_seats_taken in the database; a card that says 6 next to an event
  // page that says 8 is the bug 0033 set out to remove.
  const rsvpCountsByEvent = new Map<string, { going: number; maybe: number; answered: boolean }>()
  const goingFaces = new Map<string, AvatarUser[]>()
  const myRsvpByEvent = new Map<string, MyRsvp>()
  if (upcoming.length > 0) {
    const ids = upcoming.map((e) => e.id)
    const [{ data: rsvpRows }, { data: guestRows }] = await Promise.all([
      supabase.from('rsvps').select('event_id, user_id, status, waitlist_pos').in('event_id', ids),
      supabase.from('guests').select('event_id, host_user_id').in('event_id', ids).is('promoted_to_user_id', null),
    ])
    const userOf = new Map((roster ?? []).map((m) => [m.user_id, m.users as unknown as AvatarUser | null]))
    const seated = new Set<string>()
    for (const r of rsvpRows ?? []) {
      const cur = rsvpCountsByEvent.get(r.event_id) ?? { going: 0, maybe: 0, answered: false }
      cur.answered = true
      if (r.status === 'in' && r.waitlist_pos == null) {
        cur.going++
        seated.add(`${r.event_id}:${r.user_id}`)
        const u = userOf.get(r.user_id)
        if (u) goingFaces.set(r.event_id, [...(goingFaces.get(r.event_id) ?? []), u])
      } else if (r.status === 'maybe') cur.maybe++
      rsvpCountsByEvent.set(r.event_id, cur)
      if (r.user_id === profile.id) myRsvpByEvent.set(r.event_id, r.status as MyRsvp)
    }
    for (const g of guestRows ?? []) {
      if (!seated.has(`${g.event_id}:${g.host_user_id}`)) continue
      const cur = rsvpCountsByEvent.get(g.event_id) ?? { going: 0, maybe: 0, answered: true }
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

  const [{ data: changeReqs }, { data: joinReqs }] = isManager
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
      ])
    : [{ data: [] }, { data: [] }]

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
      <ClubBar
        clubId={club.id}
        slug={slug}
        clubName={club.name}
        memberCount={(roster ?? []).length}
        isManager={isManager}
        isAdmin={isAdmin}
        isLastAdmin={isAdmin && adminCount === 1}
        pastCount={past.length}
      />
      <main className="mx-auto w-full max-w-col px-4 pb-6">
      {/* One front door instead of banner + name row + about card. On the day
          of an event it starts folded, because the answer you came for is the
          address further down and this is not it. */}
      <ClubHeader
        name={club.name}
        avatarUrl={club.avatar_url}
        bannerUrl={club.banner_url}
        description={club.description}
        role={myRole}
        faces={rosterFaces}
        total={(roster ?? []).length}
        links={links}
        foldedByDefault={hasEventToday}
        cover={isManager ? <BannerUpload clubId={club.id} slug={slug} /> : undefined}
        picture={
          isManager ? (
            <AvatarUpload clubId={club.id} slug={slug} clubName={club.name} avatarUrl={club.avatar_url} size={64} />
          ) : undefined
        }
        edit={
          isManager ? (
            <AboutEditor clubId={club.id} slug={slug} isAdmin={isAdmin} description={club.description ?? ''} links={links} />
          ) : undefined
        }
      />

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
        <p className="mb-[26px]">
          <Link href={`/club/${slug}/new-event`} className="block">
            <Button display block size="lg" icon={<Icon name="plus" size={12} />}>
              Nuevo evento
            </Button>
          </Link>
        </p>
      )}

      <section className="mb-[26px]">
        <SectionHeader action={upcoming.length > 0 ? <span className="text-[12.5px] text-ink-300">{upcoming.length}</span> : null}>
          Próximos
        </SectionHeader>
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
                faces={goingFaces.get(e.id) ?? []}
                mine={myRsvpByEvent.get(e.id) ?? null}
                today={whenPill(e.chosen_start, e.status)?.label === 'Hoy'}
              />
            ))}
          </div>
        )}
      </section>

      {isManager && (changeReqs ?? []).length > 0 && (
        <>
          <SectionHeader
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

      {/* Above the history on purpose: it is the one thing on this page that
          keeps working after you close the app. */}
      <CollapsibleSection
        label="Suscribirme"
        icon="calendar-days"
        summary="cada evento, en tu calendario"
        className="mb-[26px]"
      >
        <CalendarSubscribe
          clubName={club.name}
          clubId={club.id}
          slug={slug}
          feedUrl={`${siteUrl()}/c/${club.calendar_token}/calendar.ics`}
          isAdmin={isAdmin}
        />
      </CollapsibleSection>

      {/* Rule 7. The club's own history and its settings were sections of this
          page, indistinguishable from the things people come here for. They
          are doors, and they say so once, under a line. */}
      <DoorGroup label="El club">
        <SummaryRow
          icon="users"
          label="Miembros"
          meta={<FaceStack people={rosterFaces} total={(roster ?? []).length} size={20} max={5} />}
          href={`/club/${slug}/members`}
        />
        <SummaryRow
          icon="clock-rotate-left"
          label="Eventos pasados"
          meta={past.length ? String(past.length) : 'ninguno todavía'}
          href={`/events?club=${club.id}&when=past`}
        />
      </DoorGroup>

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
  faces,
  mine,
  today = false,
}: {
  e: EventRow
  catName: string | undefined
  counts: { going: number; maybe: number; answered: boolean } | undefined
  faces: AvatarUser[]
  mine: MyRsvp
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
      {/* Who, then where you stand with them. The date is not repeated here:
          the pill above already said it, and saying it twice was how this row
          got to be two lines of readout. */}
      <div className="flex items-center gap-2.5 px-3.5 pb-3.5 text-[12.5px] text-ink-500">
        <FaceStack people={faces} total={counts?.going} size={22} max={5} />
        <span className="min-w-0 truncate">{attendanceLine(counts?.going ?? 0, mine, counts?.answered ?? false)}</span>
      </div>
    </Link>
  )
}
