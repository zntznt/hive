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
import { whenPill } from '@/lib/when'
import { FaceStack } from '@/components/ui/FaceStack'
import { clubFooter, quietSince, type CardEvent, type ClubFooter } from '@/lib/club-card'
import { hasHappened } from '@/lib/time'
import { getT } from '@/lib/current-lang'
import type { StringKey } from '@/lib/lang'
import { type AvatarUser } from '@/components/ui/Avatar'

type UpcomingEvent = {
  id: string
  slug: string
  title: string
  club_id: string | null
  status: string
  chosen_start: string | null
  chosen_end: string | null
  location: string | null
  area: string | null
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
function plateRowContent(
  item: PlateItem,
  t: (k: StringKey) => string,
  tf: (k: StringKey, v: Record<string, string | number>) => string
): { icon: IconName; tone: 'honey' | 'sage' | 'danger' | 'neutral'; title: string } {
  switch (item.kind) {
    case 'pay':
      return {
        icon: 'money-bill-transfer',
        tone: 'danger',
        title: tf('plate.owe', { amount: peso(item.amountCents), name: item.toName }),
      }
    case 'confirm':
      return {
        icon: 'circle-check',
        tone: 'honey',
        title: tf('plate.paidYou', { name: item.fromName, amount: peso(item.amountCents) }),
      }
    case 'answer':
      return item.asks === 'availability'
        ? { icon: 'calendar-plus', tone: 'honey', title: t('plate.availability') }
        : item.asks === 'rsvp'
          ? { icon: 'circle-info', tone: 'honey', title: t('plate.rsvp') }
          : { icon: 'square-poll-vertical', tone: 'honey', title: item.pollLabel ?? t('plate.vote') }
    case 'task':
      return { icon: 'clipboard', tone: 'sage', title: item.qty ? `${item.title} · ${item.qty}` : item.title }
    case 'bring':
      return { icon: 'basket-shopping', tone: 'sage', title: item.qty ? `${item.title} · ${item.qty}` : item.title }
  }
}

function rsvpChip(
  eventStatus: string,
  t: (k: StringKey) => string,
  myStatus?: string,
  waitlisted?: boolean
) {
  if (eventStatus === 'scheduling') return null
  if (myStatus === 'in')
    return <Badge tone={waitlisted ? 'pending' : 'mine'}>{t(waitlisted ? 'badge.waiting' : 'badge.going')}</Badge>
  return null
}

type ClubLite = { slug: string; name: string; avatar_url: string | null }

export default async function Home() {
  const { t, tf , lang } = await getT()
  // One clock for the whole render. There were two `new Date()` calls and now
  // a third would-be one, and a page that asks the time twice can straddle
  // midnight: the "last activity" cutoff and the footer's idea of today would
  // then disagree by a day on the same screen.
  const now = new Date()
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
    .select('club_id, clubs(slug, name, avatar_url)')
    .eq('user_id', uid)

  const clubById = new Map(
    (memberships ?? []).map((m) => [m.club_id, m.clubs as unknown as ClubLite | null])
  )
  const clubs = Array.from(
    new Map(
      (memberships ?? [])
        .map((m) => {
          const c = m.clubs as unknown as ClubLite | null
          return c ? ([m.club_id, { id: m.club_id, ...c }] as const) : null
        })
        .filter((c): c is readonly [string, { id: string } & ClubLite] => !!c)
    ).values()
  )
  const clubIds = [...new Set((memberships ?? []).map((m) => m.club_id).filter((id): id is string => !!id))]

  const [board, allUpcomingResult, memberCountResult] = await Promise.all([
    getPlateItems(supabase, profile.id),
    clubIds.length
      ? supabase
          .from('events')
          .select('id, slug, title, club_id, status, chosen_start, chosen_end, location, area')
          .in('club_id', clubIds)
          // `cancelled` is here on purpose. Filtering it out meant the
          // screen you check to find out about Friday stopped mentioning
          // Friday the moment Friday was called off, leaving only an
          // away-strip line that ages out after 48h. It stays as a spent
          // card: struck title, cancelled badge, no pill.
          .in('status', ['scheduling', 'scheduled', 'cancelled'])
          .is('deleted_at', null)
          .order('chosen_start', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as UpcomingEvent[] }),
    clubIds.length
      ? supabase
          .from('club_members')
          .select('club_id, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
          .in('club_id', clubIds)
          .order('joined_at')
      : Promise.resolve({ data: [] as { club_id: string; users: AvatarUser | null }[] }),
  ])

  const total = plateCount(board)
  const away = await getAwayItems(supabase, profile.id, lang)
  // Three, then the link. Four rows plus a link is five things under a header
  // whose whole job is to be a preview, at which point the reader is doing
  // Plate's work on the wrong screen.
  const shownPlate = [...board.toAnswer, ...board.toPay, ...board.toConfirm, ...board.tasks, ...board.bringing].slice(0, 3)
  const payMethodTargets = [...new Set(shownPlate.filter((i) => i.kind === 'pay').map((i) => i.toUserId))]
  const { data: payMethodRows } = payMethodTargets.length
    ? await supabase.from('payment_methods').select('user_id, kind, value').in('user_id', payMethodTargets).order('sort')
    : { data: [] as { user_id: string; kind: string; value: string }[] }
  const payMethodsFor = (uid: string) => (payMethodRows ?? []).filter((m) => m.user_id === uid)

  // When each club last actually did something, for the quiet footer's
  // "Tranquilo desde abril." The upcoming query cannot answer it: a club is
  // quiet precisely when it has nothing upcoming.
  const { data: pastRows } = clubIds.length
    ? await supabase
        .from('events')
        .select('club_id, chosen_start')
        .in('club_id', clubIds)
        .not('chosen_start', 'is', null)
        .lt('chosen_start', now.toISOString())
        .is('deleted_at', null)
        .order('chosen_start', { ascending: false })
    : { data: [] as { club_id: string; chosen_start: string }[] }
  const lastActivityByClub = new Map<string, string>()
  for (const r of (pastRows ?? []) as { club_id: string; chosen_start: string }[]) {
    if (!lastActivityByClub.has(r.club_id)) lastActivityByClub.set(r.club_id, r.chosen_start)
  }

  const allUpcoming = (allUpcomingResult.data ?? []) as UpcomingEvent[]
  const eventIds = allUpcoming.map((e) => e.id)
  const { data: myRsvps } = eventIds.length
    ? await supabase.from('rsvps').select('event_id, status, waitlist_pos').eq('user_id', profile.id).in('event_id', eventIds)
    : { data: [] as { event_id: string; status: string; waitlist_pos: number | null }[] }
  const rsvpByEvent = new Map((myRsvps ?? []).map((r) => [r.event_id, r]))

  // "coming up" only shows what you're actually committed to: events still
  // finding a time (nothing to RSVP to yet) plus scheduled events you're in
  // (confirmed or waitlisted) - not every upcoming event across your clubs.
  //
  // `hasHappened` is what makes it "coming up" rather than "joined". This
  // asked the status and the RSVP and never the clock, so a night you said yes
  // to sat under "lo que viene" with a `vas` pill for as long as nobody closed
  // it, while the quiet footer two sections down, reading `pastRows`, called
  // the same club tranquilo since that same month.
  const upcoming = allUpcoming
    .filter((e) => (e.status === 'scheduling' || rsvpByEvent.get(e.id)?.status === 'in') && !hasHappened(e, now))
    .slice(0, 5)

  // Who is in each club, not how many. "2 miembros · 2 próximos" is two
  // numbers nobody pictures, and the second one was answering a question the
  // next-event line answers by name.
  const memberCountByClub = new Map<string, number>()
  const facesByClub = new Map<string, AvatarUser[]>()
  for (const row of (memberCountResult.data ?? []) as unknown as { club_id: string; users: AvatarUser | null }[]) {
    memberCountByClub.set(row.club_id, (memberCountByClub.get(row.club_id) ?? 0) + 1)
    if (row.users) facesByClub.set(row.club_id, [...(facesByClub.get(row.club_id) ?? []), row.users])
  }
  // What each club is doing next, from the one function that decides it.
  //
  // This used to take the first row of a query ordered by chosen_start and
  // call it the next event, which has none of clubNext()'s tie-break chain and
  // no notion of today. So Home and the Clubs tab could name different next
  // events for the same club, and Home would disagree first whenever two
  // events shared a start time. club-card.ts exists to stop exactly this, and
  // its header says so.
  const footerByClub = new Map<string, ClubFooter>()
  for (const c of clubs) {
    const mine = allUpcoming.filter((e) => e.club_id === c.id) as unknown as CardEvent[]
    footerByClub.set(c.id, clubFooter(mine, lastActivityByClub.get(c.id) ?? null, now, lang))
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
      {/* Wordmark left, greeting right, one row. It was stacked with the
          greeting as a 22px display line under the mark, on the argument that
          a name deserves to be the page's headline. The kit disagrees and it
          is right: the headline on this screen is what is on your plate, and a
          22px "hola, Marta" pushes that below the fold to say something the
          reader already knows. Small, muted, out of the way. */}
      <header className="mb-[18px] mt-1 flex items-center gap-2.5">
        <BrandMark size="sm" />
        <span className="ml-auto text-[13px] text-ink-500">
          {tf('home.greeting', { name: profile.display_name })}
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
        {t('common.search')}
      </Link>

      {/* Since you were away: the last 48 hours of things that happened to
          you and need nothing from you. No unread state and no dismiss, it
          just ages out, which is the whole reason this is not an inbox. */}
      {away.length > 0 && (
        <section className="rounded-md bg-cream-sunk px-3.5 py-3">
          <p className="eyebrow mb-2">
            {t('home.away')}
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
                  <span className="flex-shrink-0 text-[11px] text-ink-300">{timeAgo(a.at, lang)}</span>
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
              {t('common.seeAll')} <Icon name="chevron-right" size={10} />
            </Link>
          }
        >
          {/* The count only when there is one. "· 0" is a badge for a number
              nobody has, printed directly above a line that already says so in
              words, and a zero in an eyebrow reads as a fault rather than as
              good news. No other section here counts itself. */}
          {t('home.plate')}
          {total > 0 && ` · ${total}`}
        </SectionHeader>
        {total === 0 && <p className="text-[13px] text-ink-500">{t('home.plate.clear')}</p>}
        {total > 0 && (
          <div className="flex flex-col gap-2">
            {shownPlate.map((item) => {
              const { icon, tone, title } = plateRowContent(item, t, tf)
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
                    {t('money.pay')}
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
                    {t('money.confirm')}
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
                {tf('home.plate.more', { n: total - shownPlate.length })} <Icon name="chevron-right" size={10} />
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
                {t('home.history')} <Icon name="chevron-right" size={10} />
              </Link>
            }
          >
            {t('home.upcoming')}
          </SectionHeader>
          {upcoming.length === 0 ? (
            <EmptyState icon="calendar-days" hint={t('home.upcoming.empty')} />
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((e) => {
                // Soon is decided by the one function that decides it
                // everywhere. The row was `border-line-card` unconditionally,
                // so tonight's event and one three weeks out were the same
                // card, while the club rows twelve lines below already
                // honoured the rule.
                const soon = whenPill(e.chosen_start, e.status, now, lang)?.soon ?? false
                const off = e.status === 'cancelled'
                const club = e.club_id ? clubById.get(e.club_id) : null
                return (
                  // A row is 12px 14px at r-md. A flat 16px is a panel, and the
                  // difference is what tells you whether this is a line in a
                  // list or a thing in its own right.
                  //
                  // Not a Link any more: the row has two destinations. The
                  // title stretches over the whole row, and the club name sits
                  // above it in the stack with its own href, so the sub-line
                  // keeps the only route it had into the club. Nesting one
                  // anchor inside another is not valid HTML, which is why this
                  // is a div with a stretched link rather than two Links.
                  <div
                    key={e.id}
                    className={`relative flex items-center justify-between gap-3 rounded-md bg-paper px-3.5 py-3 shadow-card ${
                      soon ? 'border-[1.5px] border-honey-500' : 'border border-line-card'
                    }`}
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/e/${e.slug}`}
                        className="block truncate text-sm font-bold text-ink-900 after:absolute after:inset-0"
                      >
                        <span className={off ? 'line-through' : ''}>{e.title}</span>
                      </Link>
                      <span className="text-[12.5px] text-ink-500">
                        {club ? (
                          <Link href={`/club/${club.slug}`} className="relative z-[1] font-bold text-honey-700">
                            {club.name}
                          </Link>
                        ) : (
                          '·'
                        )}
                        {e.location ? ` · ${e.location}` : ''}
                      </span>
                    </span>
                    <span className="flex flex-shrink-0 flex-col items-end gap-1">
                      {off ? (
                        <Badge tone="danger">{t('event.cancelledChip')}</Badge>
                      ) : (
                        <>
                          <WhenPill at={e.chosen_start} status={e.status} />
                          {rsvpChip(e.status, t, rsvpByEvent.get(e.id)?.status, rsvpByEvent.get(e.id)?.waitlist_pos != null)}
                        </>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="mt-[26px]">
        <SectionHeader
          action={
            <Link href="/clubs" className="tap inline-flex min-h-11 items-center gap-1 text-[12.5px] font-bold text-honey-700">
              {t('home.allClubs')}
              <Icon name="chevron-right" size={9} />
            </Link>
          }
        >
          {t('home.clubs')}
        </SectionHeader>
        {clubs.length === 0 ? (
          <EmptyState
            icon="hashtag"
            title={t('home.clubs.empty.title')}
            hint={t('home.clubs.empty.short')}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {clubs.map((c) => {
              const footer = footerByClub.get(c.id)
              const today = footer?.kind === 'today'
              return (
                <Link
                  key={c.slug}
                  href={today ? `/e/${footer.event.slug}` : `/club/${c.slug}`}
                  className={`flex items-center gap-3 rounded-md bg-paper px-3.5 py-3 shadow-card ${
                    today ? 'border-[1.5px] border-honey-500' : 'border border-line-card'
                  }`}
                >
                  {/* The club's own logo, the same one the Clubs tab and the
                      club page draw. This drew the initial instead, so a club
                      with a face had two of them: a photo one tap away and an
                      "E" here. HexAvatar falls back to the initial on its own
                      when there is no logo. */}
                  <HexAvatar name={c.name} src={c.avatar_url} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-900">{c.name}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <FaceStack
                        people={facesByClub.get(c.id) ?? []}
                        total={memberCountByClub.get(c.id)}
                        size={20}
                        max={4}
                      />
                      {/* Rule 9: what the club is doing next, by name, from
                          clubFooter. On the day that is the address, because
                          by then the name is not the open question. */}
                      <span className="min-w-0 truncate text-[12.5px] text-ink-500">
                        {footer?.kind === 'today'
                          ? (footer.event.area ?? footer.event.location ?? footer.event.title)
                          : footer?.kind === 'next'
                            ? footer.event.title
                            : quietSince(footer?.since ?? null, lang)}
                      </span>
                    </span>
                  </span>
                  {footer?.kind === 'today' ? (
                    <span className="flex-shrink-0">
                      <Badge tone="now">{footer.window}</Badge>
                    </span>
                  ) : footer?.kind === 'next' ? (
                    <WhenPill at={footer.event.chosen_start} status={footer.event.status} />
                  ) : null}
                </Link>
              )
            })}
          </div>
        )}

        {/* Its own row, not stuck to the last card. Creating a club is a
            different act from opening one, and butting the pill against the
            card read as part of it. */}
        <div className="mt-3">
          <CreateClubButton />
        </div>
      </section>

      {/* Below the things people came for, on purpose. Rule 1 gives the page
          one loud block and this is not it: it renders only when the phone can
          actually install, and never again once dismissed. */}
      <InstallPwa />

    </Page>
  )
}
