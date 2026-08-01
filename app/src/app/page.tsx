// Sign-in server actions live on this page, and one of them hands a WhatsApp
// code to Zernio in an after() callback. after() runs inside this route's
// budget, and a broadcast create alone has measured over seven seconds, so
// the platform default is not enough room to finish and record the result.
export const maxDuration = 60

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import SignIn from './signin'
import { getPlateItems, plateCount, type PlateItem } from '@/lib/plate'
import { Badge } from '@/components/ui/Badge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { BrandMark } from '@/components/ui/BrandMark'
import { PlateItemRow } from '@/components/ui/PlateItemRow'
import { Icon, type IconName } from '@/components/ui/Icon'
import { SettleUpFlow, ConfirmPaymentModal } from '@/components/settle-up'
import { CreateClubButton } from './create-club-modal'
import { Page } from '@/components/ui/Page'
import { MarkDoneButton } from './plate/mark-done-modal'
import { getAwayItems } from '@/lib/away'
import { InstallPwa } from '@/components/ui/InstallPwa'
import { timeAgo } from '@/lib/relative-time'
import { WhenPill } from '@/components/ui/WhenPill'

type UpcomingEvent = {
  id: string
  slug: string
  title: string
  club_id: string | null
  status: string
  chosen_start: string | null
  location: string | null
}

function peso(cents: number) {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function plateKey(item: PlateItem) {
  switch (item.kind) {
    case 'pay':
      return `pay-${item.eventId}-${item.toUserId}`
    case 'confirm':
      return `confirm-${item.settlementId}`
    case 'answer':
      return `answer-${item.asks}-${item.eventId}-${item.pollLabel ?? ''}`
    default:
      return `${item.kind}-${item.contributionId}`
  }
}

// Icon tile + headline copy per plate item kind. Home only previews the plate
// (link to the event), the interactive claim/confirm/done actions live on
// /plate itself.
function plateRowContent(item: PlateItem): { icon: IconName; tone: 'honey' | 'sage' | 'danger' | 'neutral'; title: string } {
  switch (item.kind) {
    case 'pay':
      return { icon: 'money-bill-transfer', tone: 'danger', title: `Le debes ${peso(item.amountCents)} a ${item.toName}` }
    case 'confirm':
      return { icon: 'circle-check', tone: 'honey', title: `${item.fromName} dice que te pagó ${peso(item.amountCents)}` }
    case 'answer':
      return item.asks === 'availability'
        ? { icon: 'calendar-plus', tone: 'honey', title: 'Marca cuándo puedes' }
        : item.asks === 'rsvp'
          ? { icon: 'circle-info', tone: 'honey', title: '¿Vas a ir?' }
          : { icon: 'square-poll-vertical', tone: 'honey', title: item.pollLabel ?? 'Falta tu voto' }
    case 'task':
      return { icon: 'clipboard', tone: 'sage', title: item.qty ? `${item.title} · ${item.qty}` : item.title }
    case 'bring':
      return { icon: 'basket-shopping', tone: 'sage', title: item.qty ? `${item.title} · ${item.qty}` : item.title }
  }
}

function rsvpChip(eventStatus: string, myStatus?: string, waitlisted?: boolean) {
  if (eventStatus === 'scheduling') return null
  if (myStatus === 'in') return waitlisted ? <Badge tone="pending">en espera</Badge> : <Badge tone="mine">vas</Badge>
  return null
}

export default async function Home() {
  const supabase = await supabaseServer()
  // getClaims() verifies locally (ES256), no Auth round trip
  const { data: claimsData } = await supabase.auth.getClaims()
  const uid = claimsData?.claims?.sub
  if (!uid) return <SignIn />

  const { data: profile } = await supabase.from('users').select('*').eq('id', uid).single()
  if (!profile || profile.status !== 'active') redirect('/pending')

  // filter to OWN memberships explicitly: RLS implicitly does this for regular
  // members, but the app admin can see every membership row of every club
  const { data: memberships } = await supabase
    .from('club_members')
    .select('club_id, clubs(slug, name)')
    .eq('user_id', uid)

  const clubById = new Map(
    (memberships ?? []).map((m) => [m.club_id, m.clubs as unknown as { slug: string; name: string } | null])
  )
  const clubs = Array.from(
    new Map(
      (memberships ?? [])
        .map((m) => {
          const c = m.clubs as unknown as { slug: string; name: string } | null
          return c ? ([m.club_id, { id: m.club_id, ...c }] as const) : null
        })
        .filter((c): c is readonly [string, { id: string; slug: string; name: string }] => !!c)
    ).values()
  )
  const clubIds = [...new Set((memberships ?? []).map((m) => m.club_id).filter((id): id is string => !!id))]

  const [board, allUpcomingResult, memberCountResult] = await Promise.all([
    getPlateItems(supabase, profile.id),
    clubIds.length
      ? supabase
          .from('events')
          .select('id, slug, title, club_id, status, chosen_start, location')
          .in('club_id', clubIds)
          .in('status', ['scheduling', 'scheduled'])
          .is('deleted_at', null)
          .order('chosen_start', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as UpcomingEvent[] }),
    clubIds.length
      ? supabase.from('club_members').select('club_id').in('club_id', clubIds)
      : Promise.resolve({ data: [] as { club_id: string }[] }),
  ])

  const total = plateCount(board)
  const away = await getAwayItems(supabase, profile.id)
  const shownPlate = [...board.toAnswer, ...board.toPay, ...board.toConfirm, ...board.tasks, ...board.bringing].slice(0, 4)
  const payMethodTargets = [...new Set(shownPlate.filter((i) => i.kind === 'pay').map((i) => i.toUserId))]
  const { data: payMethodRows } = payMethodTargets.length
    ? await supabase.from('payment_methods').select('user_id, kind, value').in('user_id', payMethodTargets).order('sort')
    : { data: [] as { user_id: string; kind: string; value: string }[] }
  const payMethodsFor = (uid: string) => (payMethodRows ?? []).filter((m) => m.user_id === uid)

  const allUpcoming = (allUpcomingResult.data ?? []) as UpcomingEvent[]
  const eventIds = allUpcoming.map((e) => e.id)
  const { data: myRsvps } = eventIds.length
    ? await supabase.from('rsvps').select('event_id, status, waitlist_pos').eq('user_id', profile.id).in('event_id', eventIds)
    : { data: [] as { event_id: string; status: string; waitlist_pos: number | null }[] }
  const rsvpByEvent = new Map((myRsvps ?? []).map((r) => [r.event_id, r]))

  // "coming up" only shows what you're actually committed to: events still
  // finding a time (nothing to RSVP to yet) plus scheduled events you're in
  // (confirmed or waitlisted) - not every upcoming event across your clubs.
  const upcoming = allUpcoming
    .filter((e) => e.status === 'scheduling' || rsvpByEvent.get(e.id)?.status === 'in')
    .slice(0, 5)

  const memberCountByClub = new Map<string, number>()
  for (const row of memberCountResult.data ?? []) {
    memberCountByClub.set(row.club_id, (memberCountByClub.get(row.club_id) ?? 0) + 1)
  }
  const upcomingCountByClub = new Map<string, number>()
  for (const e of allUpcoming) {
    if (e.club_id) upcomingCountByClub.set(e.club_id, (upcomingCountByClub.get(e.club_id) ?? 0) + 1)
  }

  return (
    <Page>
      {/* The wordmark, and who you are. Nothing else.
       *
       * This carried an avatar and a "salir" link, which put the one
       * irreversible account action on the home screen at nav prominence,
       * bold and underlined under your own name. Signing out lives in Tú with
       * the rest of the account, where the reference puts it; the avatar is
       * redundant beside a greeting that already names you. */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <BrandMark size="sm" />
        <span className="text-[13px] text-ink-500">
          hola, <span className="font-bold text-ink-900">{profile.display_name}</span>
        </span>
      </header>

      {/* Search sits directly under the header, above everything. It is the
          way into a screen the tab bar has no slot for, and burying it below
          the away strip meant it moved down the page on the days there was
          news and up on the days there was not. */}
      <Link
        href="/search"
        className="mb-[18px] flex min-h-11 items-center gap-2.5 rounded-pill border-[1.5px] border-line-input bg-paper px-4 text-sm text-ink-300"
      >
        <Icon name="magnifying-glass" size={13} className="text-ink-500" />
        Busca eventos, clubes, personas
      </Link>

      {/* Since you were away: the last 48 hours of things that happened to
          you and need nothing from you. No unread state and no dismiss, it
          just ages out, which is the whole reason this is not an inbox. */}
      {away.length > 0 && (
        <section className="rounded-lg bg-cream-sunk px-3.5 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-ink-300">
            Mientras no estabas
          </p>
          <ul className="flex flex-col gap-1.5">
            {away.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="tap flex items-center gap-2 text-[13px] text-ink-700">
                  <Icon
                    name={a.kind === 'cancelled' ? 'ban' : a.kind === 'settled' ? 'circle-check' : 'calendar-check'}
                    size={11}
                    className={a.kind === 'cancelled' ? 'text-danger' : 'text-honey-700'}
                  />
                  <span className="min-w-0 flex-1 truncate">{a.text}</span>
                  <span className="flex-shrink-0 text-[11px] text-ink-300">{timeAgo(a.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-[26px]">
        <SectionHeader
          action={
            <Link href="/plate" className="inline-flex items-center gap-1 tap text-[12.5px] font-bold text-honey-700">
              Ver todo <Icon name="chevron-right" size={10} />
            </Link>
          }
        >
          En tu plato · {total}
        </SectionHeader>
        {total === 0 && <p className="text-[13px] text-ink-500">Todo en orden. Nada te necesita ahorita.</p>}
        {total > 0 && (
          <div className="flex flex-col gap-2">
            {shownPlate.map((item) => {
              const { icon, tone, title } = plateRowContent(item)
              const action =
                item.kind === 'pay' ? (
                  <SettleUpFlow
                    eventId={item.eventId}
                    slug={item.eventSlug}
                    fromUserId={profile.id}
                    toUserId={item.toUserId}
                    toName={item.toName}
                    amountCents={item.amountCents}
                    toPaymentMethods={payMethodsFor(item.toUserId)}
                  >
                    Pagar
                  </SettleUpFlow>
                ) : item.kind === 'confirm' ? (
                  <ConfirmPaymentModal
                    settlementId={item.settlementId}
                    slug={item.eventSlug}
                    fromName={item.fromName}
                    amountCents={item.amountCents}
                    method={item.method}
                    proofSignedUrl={item.proofSignedUrl}
                  >
                    Confirmar
                  </ConfirmPaymentModal>
                ) : item.kind === 'answer' ? (
                  // nothing to mark done: the row is the question, and the
                  // event is where it gets answered
                  null
                ) : (
                  <MarkDoneButton
                    contributionId={item.contributionId}
                    slug={item.eventSlug}
                    kind={item.kind}
                    title={item.title}
                    eventTitle={item.eventTitle}
                  />
                )
              return (
                <PlateItemRow
                  key={plateKey(item)}
                  icon={icon}
                  tone={tone}
                  title={title}
                  eventTitle={item.eventTitle}
                  eventHref={`/e/${item.eventSlug}`}
                  note={item.clubName ?? undefined}
                  action={action}
                />
              )
            })}
            {total > shownPlate.length && (
              <Link href="/plate" className="tap inline-flex w-fit items-center gap-1 text-[12.5px] font-bold text-ink-500">
                +{total - shownPlate.length} más en tu plato <Icon name="chevron-right" size={10} />
              </Link>
            )}
          </div>
        )}
      </section>

      {clubIds.length > 0 && (
        <section className="mt-[26px]">
          <SectionHeader
            action={
              <Link href={`/events?person=${profile.id}&when=past`} className="inline-flex items-center gap-1 tap text-[12.5px] font-bold text-honey-700">
                Tu historial <Icon name="chevron-right" size={10} />
              </Link>
            }
          >
            Lo que viene
          </SectionHeader>
          {upcoming.length === 0 ? (
            <EmptyState icon="calendar-days" hint="Nada en puerta todavía." />
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((e) => (
                <Link
                  key={e.id}
                  href={`/e/${e.slug}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line-card bg-paper p-4 shadow-card"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink-900">{e.title}</span>
                    <span className="text-[12.5px] text-ink-500">
                      {(e.club_id && clubById.get(e.club_id)?.name) ?? '·'}
                      {e.location ? ` · ${e.location}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 flex-col items-end gap-1">
                    <WhenPill at={e.chosen_start} status={e.status} />
                    {rsvpChip(e.status, rsvpByEvent.get(e.id)?.status, rsvpByEvent.get(e.id)?.waitlist_pos != null)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mt-[26px]">
        <SectionHeader>Tus clubs</SectionHeader>
        {clubs.length === 0 ? (
          <EmptyState
            icon="bugs"
            title="Todavía no estás en ningún club"
            hint="Pide a quien organiza que te invite."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {clubs.map((c) => (
              <Link
                key={c.slug}
                href={`/club/${c.slug}`}
                className="flex items-center gap-3 rounded-lg border border-line-card bg-paper p-4 shadow-card"
              >
                <HexAvatar name={c.name} size={34} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink-900">{c.name}</span>
                  <span className="text-[12.5px] text-ink-500">
                    {memberCountByClub.get(c.id) ?? 0} miembro{(memberCountByClub.get(c.id) ?? 0) === 1 ? '' : 's'} ·{' '}
                    {upcomingCountByClub.get(c.id) ?? 0} próximo{(upcomingCountByClub.get(c.id) ?? 0) === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        <CreateClubButton />
      </section>

      {/* Below the things people came for, on purpose. Rule 1 gives the page
          one loud block and this is not it: it renders only when the phone can
          actually install, and never again once dismissed. */}
      <InstallPwa />

      {profile.is_app_admin && (
        <div className="mt-8 border-t border-line-card pt-5">
          <Link href="/admin" className="inline-flex items-center gap-1 tap text-sm font-bold text-honey-700">
            Panel de administración <Icon name="chevron-right" size={10} />
          </Link>
        </div>
      )}
    </Page>
  )
}
