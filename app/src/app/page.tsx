import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import SignIn from './signin'
import { signOut, toggleContribution } from './actions'
import { getPlateItems, plateCount, type PlateItem } from '@/lib/plate'
import { Chip } from '@/components/ui/Chip'
import { Badge } from '@/components/ui/Badge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { UserAvatar } from '@/components/ui/Avatar'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { BrandMark } from '@/components/ui/BrandMark'
import { PlateItemRow } from '@/components/ui/PlateItemRow'
import { SettleUpFlow, ConfirmPaymentModal } from '@/components/settle-up'

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

function fmtDate(d: string | null) {
  if (!d) return 'buscando fecha'
  return new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

function plateKey(item: PlateItem) {
  switch (item.kind) {
    case 'pay':
      return `pay-${item.eventId}-${item.toUserId}`
    case 'confirm':
      return `confirm-${item.settlementId}`
    default:
      return `${item.kind}-${item.contributionId}`
  }
}

// Icon tile + headline copy per plate item kind. Home only previews the plate
// (link to the event), the interactive claim/confirm/done actions live on
// /plate itself.
function plateRowContent(item: PlateItem): { emoji: string; tone: 'honey' | 'sage' | 'danger' | 'neutral'; title: string } {
  switch (item.kind) {
    case 'pay':
      return { emoji: '💸', tone: 'danger', title: `Le debes ${peso(item.amountCents)} a ${item.toName}` }
    case 'confirm':
      return { emoji: '✅', tone: 'honey', title: `${item.fromName} dice que te pagó ${peso(item.amountCents)}` }
    case 'task':
      return { emoji: '📋', tone: 'sage', title: item.qty ? `${item.title} · ${item.qty}` : item.title }
    case 'bring':
      return { emoji: '🧺', tone: 'sage', title: item.qty ? `${item.title} · ${item.qty}` : item.title }
  }
}

function rsvpChip(eventStatus: string, myStatus?: string, waitlisted?: boolean) {
  if (eventStatus === 'scheduling') return <Chip variant="neutral">buscando fecha</Chip>
  if (myStatus === 'in') return waitlisted ? <Badge tone="pending">en espera</Badge> : <Chip variant="honey">vas</Chip>
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
          .order('chosen_start', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as UpcomingEvent[] }),
    clubIds.length
      ? supabase.from('club_members').select('club_id').in('club_id', clubIds)
      : Promise.resolve({ data: [] as { club_id: string }[] }),
  ])

  const total = plateCount(board)
  const shownPlate = [...board.toPay, ...board.toConfirm, ...board.tasks, ...board.bringing].slice(0, 4)
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
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-7 flex items-center justify-between gap-3">
        <BrandMark size="sm" />
        <div className="flex items-center gap-2.5">
          <UserAvatar user={profile} size={36} />
          <div className="text-[12.5px] leading-tight text-ink-500">
            <div>
              hola, <span className="font-bold text-ink-900">{profile.display_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/account" className="font-bold text-honey-700">
                cuenta
              </Link>
              <span aria-hidden="true">·</span>
              <form action={signOut} className="contents">
                <button type="submit" className="font-bold text-ink-500 underline underline-offset-2">
                  salir
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {total > 0 && (
        <section className="mb-7">
          <SectionHeader
            action={
              <Link href="/plate" className="text-[12.5px] font-bold text-honey-700">
                Ver todo →
              </Link>
            }
          >
            En tu plato · {total}
          </SectionHeader>
          <div className="flex flex-col gap-2">
            {shownPlate.map((item) => {
              const { emoji, tone, title } = plateRowContent(item)
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
                ) : (
                  <form action={toggleContribution.bind(null, item.contributionId, item.eventSlug, true)}>
                    <button className="font-bold text-honey-700">Hecho</button>
                  </form>
                )
              return (
                <PlateItemRow
                  key={plateKey(item)}
                  emoji={emoji}
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
              <Link href="/plate" className="text-[12.5px] font-bold text-ink-500">
                +{total - shownPlate.length} más en tu plato →
              </Link>
            )}
          </div>
        </section>
      )}

      {clubIds.length > 0 && (
        <section className="mb-7">
          <SectionHeader>Lo que viene</SectionHeader>
          {upcoming.length === 0 ? (
            <EmptyState emoji="📅" hint="Nada en puerta todavía." />
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
                      {(e.club_id && clubById.get(e.club_id)?.name) ?? '·'} · {fmtDate(e.chosen_start)}
                      {e.location ? ` · ${e.location}` : ''}
                    </span>
                  </span>
                  {rsvpChip(e.status, rsvpByEvent.get(e.id)?.status, rsvpByEvent.get(e.id)?.waitlist_pos != null)}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <SectionHeader>Tus clubs</SectionHeader>
        {clubs.length === 0 ? (
          <EmptyState
            emoji="🐝"
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

        <Link
          href="/club/new"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border-[1.5px] border-line-input bg-paper px-[18px] py-[11px] text-sm font-extrabold text-ink-700"
        >
          <span aria-hidden="true">+</span> Crear un club
        </Link>
      </section>

      {profile.is_app_admin && (
        <div className="mt-8 border-t border-line-card pt-5">
          <Link href="/admin" className="text-sm font-bold text-honey-700">
            Panel de administración →
          </Link>
        </div>
      )}
    </main>
  )
}
