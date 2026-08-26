import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { Contribution, EventRow, RsvpStatus } from '@/lib/types'
import { addGuest, removeGuest, setRsvp, toggleContribution, removeContribution } from '@/app/actions'
import Grid from './grid'
import Expenses from './expenses'
import Polls from './polls'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { Icon, type IconName } from '@/components/ui/Icon'
import { rsvpKey } from '@/components/ui/RsvpToggle'
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
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'
import { useT } from '@/components/ui/LangProvider'
import { Loud, OpenSection, SummaryRow, FoldedEmpties, DoorGroup } from '@/components/ui/Density'
import { WhereCard } from './where-card'
import { DetailsSheet } from '@/components/ui/DetailsSheet'
import { AddExpenseButton } from './expense-modal'
import { AddPollButton } from './poll-modal'
import { AttendanceSheet, type RollCallPerson } from './attendance-sheet'
import { ClosedReceipt, DuplicatePrompt } from './done-blocks'
import { RsvpRow } from './rsvp-row'
import { WhoIsComing, type Attendee } from './who-is-coming'
import { PendingAnswers } from './pending-answers'
import { duplicateWindow } from '@/lib/duplicate-window'
import { fmtDayMonth, fmtSpan, fmtWindow, hasHappened, isEventDay } from '@/lib/time'
import { attendanceKeys } from '@/lib/event-line'
import { getT } from '@/lib/current-lang'

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
  const { t, tf , lang } = await getT()
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
          {t('event.inviteOnlyNote')}
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
  // Who has already been nudged about this event, read from the outbox, which
  // is the same place nudgeMissingAvailability checks before it queues. One
  // nudge per member per event, ever, is a rule the server already keeps; the
  // card could not show it because nobody asked the outbox.
  const { data: nudgeRows } = await supabase
    .from('notification_outbox')
    .select('user_id, created_at')
    .eq('template', 'availability_pending')
    .eq('payload->>event_id', event.id)
  const nudgedIds = new Set((nudgeRows ?? []).map((r) => r.user_id as string))
  const nudgedAt = (nudgeRows ?? [])
    .map((r) => r.created_at as string)
    .sort()
    .at(-1) ?? null

  const waitingOn = (members ?? [])
    .filter((m) => !painted.has(m.user_id))
    .map((m) => ({
      id: m.user_id as string,
      user: (userOf.get(m.user_id) ?? { display_name: '·' }) as AvatarUser,
      nudged: nudgedIds.has(m.user_id as string),
    }))

  const contributions = (contribs ?? []) as Contribution[]
  const byStatus = (st: RsvpStatus) => (rsvps ?? []).filter((r) => r.status === st)
  // Who has not answered at all, by name. Not the same as "no voy": a no is an
  // answer, and the difference between the two is whether there is anybody
  // left to nudge.
  const answered = new Set((rsvps ?? []).map((r) => r.user_id as string))
  const silent = (members ?? [])
    .filter((m) => !answered.has(m.user_id as string))
    .map((m) => ({
      id: m.user_id as string,
      name: nameOf.get(m.user_id) ?? '·',
      user: (userOf.get(m.user_id) ?? { display_name: '·' }) as AvatarUser,
    }))

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

  // One chip per person, and the guests they bring ride on their chip.
  const attendees: Attendee[] = confirmed.map((r) => ({
    key: r.user_id as string,
    name: nameOf.get(r.user_id) ?? '·',
    user: (userOf.get(r.user_id) ?? { display_name: nameOf.get(r.user_id) ?? '·' }) as AvatarUser,
    plus: guestCountByHost.get(r.user_id) ?? 0,
    mine: r.user_id === profile.id,
  }))

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

  // Over, whether or not anybody closed it. `done` is written only by an
  // organizer tapping "cerrar", and most nights nobody does, so this page kept
  // saying "Vas a ir" about an evening two weeks gone, asked people who never
  // answered to RSVP to it, and never opened the roll call for the organizer
  // who would have taken it.
  //
  // Only `scheduled` earns the clock. A night that was called off did not
  // happen and has nobody to count, and one still finding a date has no
  // instant to compare against.
  //
  // It sits above `loud` because that is one of the things it has to switch
  // off, and a const cannot be read before it is declared.
  const isDone = !event.deleted_at && (event.status === 'done' || (event.status === 'scheduled' && hasHappened(event)))

  // Rule 4: one auto-open thing, nearest deadline only, and it never re-arms.
  // Deterministic beats clever, so this is a fixed order rather than a score.
  const loud: 'availability' | 'rsvp' | 'none' =
    event.status === 'cancelled' || event.deleted_at || isDone
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
    isEventDay(event)

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
  // What a duplicate actually takes with it, spelled out for the confirmation.
  // The modal is a contract, so this is built from the event's own row rather
  // than from a sentence somebody wrote once and forgot to update.
  const carriesOver: { icon: IconName; text: string }[] = [
    { icon: 'heading', text: tf('event.nameIs', { title: event.title }) },
    event.location ? { icon: 'location-dot', text: event.location } : null,
    category ? { icon: 'tag', text: category.name as string } : null,
    event.capacity != null
      ? {
          icon: 'users' as const,
          text: `${tf('event.capacityFor', { n: event.capacity })}${event.waitlist_enabled ? t('event.withWaitlist') : t('event.noWaitlist')}`,
        }
      : null,
    {
      icon: 'user-plus',
      text: t(event.allow_guests ? 'event.guestsAllowed' : 'event.noGuests'),
    },
    contributions.length > 0
      ? {
          icon: 'basket-shopping' as const,
          text: `${contributions.length} ${contributions.length === 1 ? 'cosa' : 'cosas'} que traer, ${contributions
            .slice(0, 3)
            .map((c) => c.title)
            .join(', ')}${contributions.length > 3 ? tf('event.andMore', { n: contributions.length - 3 }) : ''}`,
        }
      : null,
  ].filter((x): x is { icon: IconName; text: string } => !!x)

  // Three candidate weeks: the one the action would pick, and the two after
  // it. The organizer changes the week here rather than in the event form,
  // because leaving takes the two lists off screen as they are being read.
  const dupWindow = duplicateWindow(event.sched_start_date, event.sched_end_date)
  const weekOptions = dupWindow
    ? [0, 1, 2].map((n) => duplicateWindow(event.sched_start_date, event.sched_end_date, n)!.start)
    : []

  // True only while every carried item is still unclaimed.
  const carriedOver =
    !!event.duplicated_from && contributions.length > 0 && contributions.every((c) => !c.assigned_to)

  // What I said I would bring and have not marked done. Only mine: the row is
  // a reminder, not a roster.
  const myUnfinished = contributions.find((c) => c.assigned_to === profile.id && !c.done) ?? null

  // The receipt the where-card carries. Both phases have one, because both
  // phases have somebody who did a thing and a next step nobody should have to
  // ask about: once there is a time it is "who locked it and were we told",
  // and before that it is "who opened the poll and when does it close".
  const organizerName = nameOf.get(event.organizer_user_id) ?? t('event.organizer')
  const receipt: { icon: IconName; text: string } | null = event.scheduled_at
    ? { icon: 'lock', text: tf('event.lockedTime', { name: organizerName, ago: timeAgo(event.scheduled_at, lang) }) }
    : event.status === 'scheduling'
      ? {
          icon: 'pen',
          text: tf('event.pollOpenedBy', {
            name: organizerName,
            ago: event.created_at ? ` ${timeAgo(event.created_at, lang)}` : '',
          }),
        }
      : null

  // Which verb the RSVP count uses, in the three places on this page that
  // print it. One decision, taken off `isDone` like everything else here.
  const tense = attendanceKeys(isDone)
  const rollCallTaken = !!event.attendance_taken_at
  // null when the roll call did not cover me at all (I was not confirmed), so
  // the member block can stay off rather than claim a no-show.
  const myAttendance: boolean | null = (() => {
    const mine = confirmed.find((r) => r.user_id === profile.id)
    return mine ? mine.attended !== false : null
  })()
  const photosBlock =
    (isDone || photos.length > 0) ? (
      <section className="mb-[26px]">
        <OpenSection label={t('event.photos')} meta={photos.length ? String(photos.length) : undefined}>
          <Photos
            eventId={event.id}
            slug={event.slug}
            photos={photos}
            canAdd={!!myMembership && !event.deleted_at}
            reason={
              event.deleted_at
                ? t('event.binNoPhotos2')
                : t('event.onlyWent2')
            }
          />
        </OpenSection>
      </section>
    ) : null

  const dateChip =
    event.status === 'scheduling'
      ? t('event.dateTBD')
      : event.status === 'scheduled' && !isDone && event.chosen_start
        ? // day plus the whole span, not just the start: the end is what tells
          // you if you are free after and when to get a ride home
          `${fmtDayMonth(event.chosen_start, lang)} · ${fmtSpan(event.chosen_start, event.chosen_end, lang)}`
        : isDone
          ? (event.chosen_start ? tf('event.heldOn', { date: fmtDayMonth(event.chosen_start, lang) }) : t('event.heldLower'))
          : event.status === 'cancelled'
            ? t('event.cancelledChip')
            : t('event.draftChip')

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
        duplicate={isOrganizer ? { clubName: club?.name ?? null, carries: carriesOver, weeks: weekOptions } : undefined}
      />
      <main className="mx-auto w-full max-w-col px-4 pb-6">

      {/* A binned event stays reachable by direct link so it can be brought
          back, and says plainly that it is on its way out. */}
      {event.deleted_at && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-md border border-danger-bg bg-danger-bg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-700">
          <Icon name="trash" size={15} />
          <span>
            {tf('event.inBin', { ago: timeAgo(event.deleted_at, lang) })}
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
            {t('event.cancelledLong')}
          </span>
        </div>
      )}

      {/* Rule 1. One loud block, answering "what do I do here" before you read
          anything. Rule 4 picks it: nearest deadline, fixed order, and once
          you have answered it goes quiet instead of re-arming. */}
      {loud === 'rsvp' && (
        <div className="mb-3.5">
          <Loud
            title={tf('event.waitingYou', { name: nameOf.get(event.organizer_user_id) ?? t('event.organizer') })}
            body={
              <>
                {event.title}
                {event.chosen_start ? `, ${dateChip}` : ''}.{' '}
                {/* One whole sentence per case: Spanish and English put the
                    number and the verb in different places, so a count glued
                    to a fragment is wrong in one of them. */}
                {confirmed.length === 1
                  ? t('event.saidYesJustOne')
                  : tf('event.saidYes', { n: confirmed.length })}
              </>
            }
            faces={confirmed.map((r) => userOf.get(r.user_id) ?? { display_name: nameOf.get(r.user_id) ?? '·' })}
          >
            {/* three answers, not two: "quizás" is a state this event can
                display and count, so it has to be one you can enter */}
            {/* Three equal segments, because they are three answers to one
                question. They were a 2-up grid plus a small ghost link on its
                own row, so the three were drawn at three weights and the third
                barely read as an answer at all, while the row you get once you
                change your mind already shows them as equals. */}
            <div className="grid grid-cols-3 gap-2">
              <form action={setRsvp.bind(null, event.id, event.slug, 'in')}>
                <Button block display>
                  {t(rsvpKey('in'))}
                </Button>
              </form>
              <form action={setRsvp.bind(null, event.id, event.slug, 'maybe')}>
                <Button block variant="secondary">
                  {t(rsvpKey('maybe'))}
                </Button>
              </form>
              <form action={setRsvp.bind(null, event.id, event.slug, 'out')}>
                <Button block variant="secondary">
                  {t(rsvpKey('out'))}
                </Button>
              </form>
            </div>
          </Loud>
        </div>
      )}

      {loud === 'availability' && (
        <div className="mb-3.5">
          <Loud
            title={t('event.markAvailability')}
            body={
              <>
                {tf('event.nobodyCanFix', { n: waitingOn.length, total: (members ?? []).length })}
              </>
            }
            faces={waitingOn.map((w) => w.user)}
          />
        </div>
      )}

      {/* the loud block, after you have answered it. A decision you already
          made should not keep shouting, and it should not be re-asked six rows
          further down either: this row is the only RSVP control on the page. */}
      {loud === 'none' && event.status === 'scheduled' && myRsvp && !event.deleted_at && !isDone && (
        <div className="mb-3.5">
          <RsvpRow
            eventId={event.id}
            slug={event.slug}
            status={myRsvp.status as 'in' | 'maybe' | 'out'}
            note={myWaitPos >= 0 ? tf('event.waitlistPos', { n: myWaitPos + 1 }) : null}
          />
        </div>
      )}

      <WhereCard tr={t} tf={tf}
        location={event.location}
        lat={event.lat}
        lng={event.lng}
        area={event.area}
        title={event.title}
        span={fmtSpan(event.chosen_start, event.chosen_end, lang)}
        window={
          event.status === 'scheduling'
            ? fmtWindow(event.sched_start_date, event.sched_end_date, event.sched_time_min, event.sched_time_max, lang)
            : null
        }
        going={seatsTaken}
        done={isDone}
        receipt={receipt}
        status={event.status}
        chosenStart={event.chosen_start}
        today={isToday}
        canEdit={!!isOrganizer}
        editHref={`/e/${event.slug}/edit`}
        calendar={
          event.status === 'scheduled' && !isDone && event.chosen_start ? (
            <AddToCalendar
              slug={event.slug}
              title={event.title}
              startIso={event.chosen_start}
              endIso={event.chosen_end}
              location={event.location}
              clubName={club?.name ?? null}
              eventUrl={`${siteUrl()}/e/${event.slug}`}
            />
          ) : undefined
        }
      />

      {/* Rule 8's other half. At 19:50 the address is what you need, and the
          one thing you can still get wrong is the thing you said you would
          bring. It is loud for exactly as long as it is unfinished. */}
      {isToday && myUnfinished && (
        <div className="mb-[26px] flex items-center gap-2.5 rounded-lg border-[1.5px] border-honey-500 bg-honey-50 px-3.5 py-3">
          <Icon name="basket-shopping" size={15} className="flex-shrink-0 text-honey-800" />
          <span className="min-w-0 flex-1 text-[13.5px] font-bold text-ink-900">
            {tf('event.youBring', { what: myUnfinished.title })}
          </span>
          <span className="flex-shrink-0 text-[12.5px] text-ink-500">{t('event.dontForget')}</span>
        </div>
      )}

      {isClubGuest && (
        <div className="mb-[26px] rounded-lg border border-honey-200 bg-honey-50 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5">
              <Icon name="hand" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-ink-900">
                {t('event.hereAsGuestOf')}{' '}
                <Link href={`/club/${club!.slug}`} className="text-honey-700">
                  {club!.name}
                </Link>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-700">
                {pendingJoinReq
                  ? t('event.askedJoin')
                  : club!.join_mode === 'anyone_with_link'
                    ? t('event.guestJoinAsk')
                    : t('event.guestOk')}
              </p>
            </div>
            {club!.join_mode === 'anyone_with_link' &&
              (pendingJoinReq ? (
                <Badge tone="pending">{t('status.pending')}</Badge>
              ) : (
                <RequestJoinClubButton joinToken={club!.join_token} />
              ))}
          </div>
        </div>
      )}


      {/* Cancelling still gets its own line: it is news, and it is about the
          event as a whole rather than about where it is. The "fijó la hora"
          receipt moved inside the where-card, next to the time it describes. */}
      {event.cancelled_at && (
        <p className="mb-3.5 text-[12px] text-ink-300">
          {tf('event.cancelledAgo', { ago: timeAgo(event.cancelled_at, lang) })}
        </p>
      )}

      {event.status === 'scheduling' && event.sched_start_date && event.sched_end_date && (
        <section className="mb-[26px]">
          <p className="mb-2.5 text-sm text-ink-500">{t('event.stillFinding')}</p>
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
              nudgedAt={nudgedAt}
            />
          </Card>
        </section>
      )}

      {/* Rule 1 again, for the one phase that has its own single job: once the
          event is over, the only thing left that only the organizer can do is
          say who actually turned up. It sits above t('event.going') because it is
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
          place={event.location}
          items={contributions.length}
          clubName={club?.name ?? null}
          carries={carriesOver}
          weeks={weekOptions}
        />
      )}

      {event.status !== 'scheduling' && event.status !== 'cancelled' && (
        <section className="mb-[26px]">
          <OpenSection
            label={t(tense.heading)}
            meta={`${seatsTaken}${event.capacity != null ? tf('event.ofCapacity', { n: event.capacity }) : ''}`}
          >
          {/* The count first, in one line, then the people. "van 6 de 8" is
              what you check; the chips are who. The two lines that used to say
              this ("van 6/8 · no van 2 · quizás 1" and a comma list of names
              120px above it) were one fact each, printed twice. */}
          <p className="text-[12.5px] text-ink-500">
            {tf(tense.count, { n: seatsTaken })}
            {event.capacity != null && tf('event.ofCapacity', { n: event.capacity })}
            {waitlisted.length > 0 && tf('event.waitingN', { n: waitlisted.length })}
            {byStatus('out').length > 0 && tf(tense.notGoing, { n: byStatus('out').length })}
            {byStatus('maybe').length > 0 && tf('event.maybeN', { n: byStatus('maybe').length })}
          </p>

          <WhoIsComing people={attendees} youLabel={t('event.you')} />


          {/* Not once the night is over. The footer of this same page already
              says the RSVPs are closed, and "Traer a alguien (+1)" sitting
              four hundred pixels above that is the page arguing with itself. */}
          {event.allow_guests && myRsvp?.status === 'in' && !isDone && (
            <div className="mt-3 rounded-md bg-cream-sunk px-3 py-2.5">
              {myGuests.map((g) => (
                <form key={g.id} action={removeGuest.bind(null, g.id, event.slug)} className="mb-1.5 flex items-center justify-between gap-2 text-sm last:mb-0">
                  <span className="text-ink-700">+1 · {g.name}</span>
                  <button className="tap text-xs font-bold text-ink-500">{t('common.removeLower')}</button>
                </form>
              ))}
              {/* the form is hidden rather than left to fail: guests_fit
                  refuses one that does not fit, and a button that always
                  throws is worse than a button that is not there */}
              {event.capacity == null || seatsTaken < event.capacity ? (
                <form action={addGuest.bind(null, event.id, event.slug)} className="flex gap-2">
                  <input name="name" placeholder={t('event.guestName')} className="flex-1 rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
                  <button className="tap rounded-md bg-honey-500 px-3 py-2 text-xs font-bold text-charcoal">{t('event.bringSomeone')}</button>
                </form>
              ) : (
                <p className="text-[12.5px] text-ink-500">{t('event.noRoomGuests')}</p>
              )}
            </div>
          )}

          {myRsvp?.status === 'in' && myWaitPos >= 0 && (
            <p className="mt-3 rounded-md bg-honey-50 px-3 py-2 text-sm text-honey-800">
              {tf('event.waitlistNote', { n: myWaitPos + 1 })}
            </p>
          )}

          {waitlisted.length > 0 && (
            <div className="mt-3 rounded-md border border-line-card bg-paper p-3.5">
              <div className="mb-2 text-xs font-bold uppercase tracking-label text-ink-500">{tf('event.waitlistHeader', { n: waitlisted.length })}</div>
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
              <p className="mt-2 text-[11.5px] text-ink-300">{t('event.waitlist.note')}</p>
            </div>
          )}
          </OpenSection>
        </section>
      )}

      {/* Silence, by name, with the chase attached. It sits under t('event.going')
          rather than inside it because it is a different question: that block
          is who is coming, this one is who still owes an answer. */}
      {event.status === 'scheduled' && !isDone && !event.deleted_at && (
        <PendingAnswers eventId={event.id} slug={event.slug} people={silent} canRemind={!!isOrganizer} />
      )}

      <div className="mb-[26px] flex flex-col gap-2">
      <div className="flex items-baseline gap-2.5 px-0.5">
        <span className="eyebrow">{t('event.contributions')}</span>
        {/* the count that matters is what is still unclaimed, and it belongs
            in the header rather than in an empty state under the list */}
        {unclaimed.length > 0 && (
          <span className="text-[11.5px] font-bold text-honey-800">{tf('event.unclaimedN', { n: unclaimed.length })}</span>
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
      {/* A duplicated event opens with the whole bring list carried over and
          nothing claimed, which looks exactly like a list everybody walked away
          from. To somebody who was at the last one and remembers claiming the
          hielo, that reads as the club quietly dropping out.

          So it says what happened, in words, before the rows. And only while
          it is true: the moment anyone claims anything this goes and the
          normal list takes over, because by then "nadie ha apartado nada" is a
          lie. */}
      {carriedOver && (
        <p className="rounded-md border border-line-card bg-cream-sunk px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-700">
          {t('event.reused')}
        </p>
      )}
      {contributions.length === 0 && <p className="text-sm text-ink-500">{t('event.contrib.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {contributions.map((c) => (
          <li key={c.id}>
            {/* A row, not a Card. `pad="row"` still resolves to r-lg with a
                shadow, so four contributions read as four objects rather than
                one list, and Density.tsx already states the rule this broke. */}
            <div className="flex min-h-11 items-center justify-between rounded-md border border-line-card bg-paper px-3.5 py-3 text-sm">
              <span className={c.done ? 'text-ink-300 line-through' : 'text-ink-900'}>
                {c.title}
                {c.qty ? ` · ${c.qty}` : ''}
                {c.kind === 'task' && <Badge className="ml-2">{t('event.taskBadge')}</Badge>}
              </span>
              {c.assigned_to ? (
                <span className="flex items-center gap-2 text-ink-500">
                  {c.assigned_to === profile.id ? t('event.you') : (nameOf.get(c.assigned_to) ?? '·')}
                  {(c.assigned_to === profile.id || isOrganizer) && !c.done && (
                    <>
                      <EditContributionButton id={c.id} slug={event.slug} title={c.title} qty={c.qty} />
                      <form action={removeContribution.bind(null, c.id, event.slug)}>
                        <button aria-label={t('common.remove')} className="tap text-xs text-ink-300">
                          <Icon name="xmark" size={12} />
                        </button>
                      </form>
                      <form action={toggleContribution.bind(null, c.id, event.slug, true)}>
                        <button className="tap text-xs font-bold text-honey-700">{t('event.markDoneLower')}</button>
                      </form>
                    </>
                  )}
                  {c.done && (c.assigned_to === profile.id || isOrganizer) && (
                    <form action={toggleContribution.bind(null, c.id, event.slug, false)}>
                      <button className="tap text-xs font-bold text-honey-700">{t('common.undo')}</button>
                    </form>
                  )}
                </span>
              ) : (
                <ClaimContributionButton id={c.id} slug={event.slug} title={c.title} eventTitle={event.title} />
              )}
            </div>
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
            {t('event.noExpensesOrPolls')}
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

      <Polls tr={t} eventId={event.id} slug={event.slug} myId={profile.id} isOrganizer={!!isOrganizer} nameOf={nameOf} polls={(polls ?? []) as never} />
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
          <span>{t('event.closed')}</span>
        </p>
      )}

      {/* What the roll call recorded about YOU. Both attendance blocks were
          gated on `isOrganizer`, so somebody wrongly marked absent had no way
          to find out and no way to see what their club-page count is built
          from. The organizer keeps the sheet; a member gets the one line that
          is about them. */}
      {isDone && rollCallTaken && !isOrganizer && myAttendance !== null && (
        <section className="mb-[26px]">
          <SectionHeader>{t('event.attendance')}</SectionHeader>
          <div
            className={`rounded-lg border bg-paper p-4 ${
              myAttendance ? 'border-line-card' : 'border-warning-bg'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full ${
                  myAttendance ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
                }`}
              >
                <Icon name={myAttendance ? 'check' : 'xmark'} size={12} />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[17px] font-bold leading-[1.25] text-ink-900">
                  {t(myAttendance ? 'event.youWereHere' : 'event.youWereNoShow')}
                </span>
                {event.attendance_taken_at && (
                  <span className="mt-0.5 block text-[12.5px] text-ink-500">
                    {tf('event.attendanceRecorded', { ago: timeAgo(event.attendance_taken_at, lang) })}
                  </span>
                )}
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-ink-300">
              {t(myAttendance ? 'event.attendanceFeeds' : 'event.attendanceMissed')}
            </p>
          </div>
        </section>
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
      <DoorGroup label={t('event.elsewhere')}>
        {club && <SummaryRow icon="hashtag" label={club.name} meta={t('club.theClub')} href={`/club/${club.slug}`} />}
        {club && <SummaryRow icon="clock-rotate-left" label={t('event.otherEvents')} href={`/events?club=${club.id}`} />}
        <DetailsSheet label={t('details.label')}>
          <div className="flex flex-col gap-2">
            <span className="eyebrow">{t('event.organizers')}</span>
            <div className="flex flex-wrap gap-2">
              {organizers.map((o) => (
                <span
                  key={o.user_id}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line-card bg-paper py-[3px] pl-[3px] pr-2.5 text-[12.5px] font-bold text-ink-900"
                >
                  <UserAvatar user={userOf.get(o.user_id) ?? { display_name: nameOf.get(o.user_id) ?? '·' }} size={22} />
                  {nameOf.get(o.user_id)}
                  {o.user_id === event.organizer_user_id && <Badge tone="mine">{t('event.host')}</Badge>}
                </span>
              ))}
            </div>
            {isOrganizer && (
              <CoOrganizerButton eventId={event.id} slug={event.slug} candidates={coOrganizerCandidates} />
            )}
          </div>

          <div className="flex flex-col gap-1.5 text-[12.5px] text-ink-500">
            <span className="eyebrow text-ink-500">{t('event.sheet')}</span>
            <span>
              <Icon name="globe" size={11} /> {t('event.timesInMx')}
            </span>
            <span>
              <Icon name="lock" size={11} />{' '}
              {event.join_policy === 'anyone_with_link'
                ? t('event.join.anyone')
                : event.join_policy === 'invite_only'
                  ? t('event.join.invite')
                  : t('event.join.members')}
            </span>
            {event.capacity != null && (
              <span>
                <Icon name="users" size={11} /> {tf('event.capacityFor', { n: event.capacity })}
                {event.waitlist_enabled ? t('event.withWaitlist') : ''}.
              </span>
            )}
            {event.scheduled_at && (
              <span>
                <Icon name="calendar-check" size={11} />{' '}
                {tf('event.fixedTimeBy', { name: nameOf.get(event.organizer_user_id) ?? t('event.organizer'), ago: timeAgo(event.scheduled_at, lang) })}
              </span>
            )}
          </div>
        </DetailsSheet>
      </DoorGroup>
    </main>
    </>
  )
}
