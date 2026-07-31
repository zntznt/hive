import type { SupabaseClient } from '@supabase/supabase-js'
import { suggestTransfers, netOfPending, type NetPosition } from './settle'

type EventBalanceRow = { event_id: string; user_id: string; net_cents: number }
type SettlementRow = {
  id: string
  event_id: string
  from_user: string
  to_user: string
  amount_cents: number
  confirmed: boolean
  method: string | null
  proof_path: string | null
}
type ContributionRow = {
  id: string
  event_id: string
  kind: 'bring' | 'task'
  title: string
  qty: string | null
}
type EventRow = { id: string; slug: string; title: string; club_id: string | null }
type ClubRow = { id: string; name: string; slug: string }

export type PlateItem =
  | {
      kind: 'pay'
      eventId: string
      eventTitle: string
      eventSlug: string
      clubName: string | null
      toUserId: string
      toName: string
      amountCents: number
    }
  | {
      kind: 'confirm'
      settlementId: string
      eventId: string
      eventTitle: string
      eventSlug: string
      clubName: string | null
      fromUserId: string
      fromName: string
      amountCents: number
      method: string | null
      proofSignedUrl: string | null
    }
  | {
      kind: 'task'
      contributionId: string
      eventId: string
      eventTitle: string
      eventSlug: string
      clubName: string | null
      title: string
      qty: string | null
    }
  | {
      kind: 'bring'
      contributionId: string
      eventId: string
      eventTitle: string
      eventSlug: string
      clubName: string | null
      title: string
      qty: string | null
    }

  | {
      // The most time-sensitive class, and the only one that expires on its
      // own. Phase-derived: once a time is locked the availability item stops
      // existing, and an open poll closes with it. Nothing to mark done, so
      // these rows only ever navigate to the event.
      kind: 'answer'
      eventId: string
      eventTitle: string
      eventSlug: string
      clubName: string | null
      asks: 'availability' | 'rsvp' | 'poll'
      pollLabel?: string
      // when this stops being answerable, for the surfaces that rank items
      dueAt: string | null
    }

// One identity per row, agreed by every surface that draws it, so a snooze
// set on /plate is the same row Home hides and the badge stops counting.
export function plateItemKey(item: PlateItem): string {
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

// Net position with each person across every event, for the read-only
// roll-up under the plate. Deliberately read-only: paying, proof and
// confirmation stay on the event, because one netted transfer cannot be
// accepted or rejected per event.
export type StandingRow = { userId: string; name: string; netCents: number; events: number }

export type PlateBoard = {
  toAnswer: Extract<PlateItem, { kind: 'answer' }>[]
  toPay: Extract<PlateItem, { kind: 'pay' }>[]
  toConfirm: Extract<PlateItem, { kind: 'confirm' }>[]
  tasks: Extract<PlateItem, { kind: 'task' }>[]
  bringing: Extract<PlateItem, { kind: 'bring' }>[]
}

async function eventContext(supabase: SupabaseClient, eventIds: string[]) {
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, club_id')
    .in('id', eventIds.length ? eventIds : ['00000000-0000-0000-0000-000000000000'])
  const evs = (events ?? []) as EventRow[]
  const clubIds = [...new Set(evs.map((e) => e.club_id).filter((id): id is string => !!id))]
  const { data: clubs } = clubIds.length
    ? await supabase.from('clubs').select('id, name, slug').in('id', clubIds)
    : { data: [] as ClubRow[] }
  const clubById = new Map((clubs ?? []).map((c) => [c.id, c as ClubRow]))
  const evById = new Map(evs.map((e) => [e.id, e]))
  return {
    titleOf: (eid: string) => evById.get(eid)?.title ?? '·',
    slugOf: (eid: string) => evById.get(eid)?.slug ?? '',
    clubNameOf: (eid: string) => {
      const e = evById.get(eid)
      return e?.club_id ? (clubById.get(e.club_id)?.name ?? null) : null
    },
  }
}

// Aggregates everything actionable across every club the user is in: debts to
// pay, claimed payments to confirm, and open tasks/contributions. Shared by
// Home's "on your plate" preview and the full /plate page.
export async function getPlateItems(supabase: SupabaseClient, userId: string): Promise<PlateBoard> {
  const board: PlateBoard = { toAnswer: [], toPay: [], toConfirm: [], tasks: [], bringing: [] }

  // 0) things people are waiting on you for. Read from the event's phase, so
  // an item cannot outlive the question: painting is only owed while a time is
  // being found, an RSVP only once one exists.
  const { data: myClubs } = await supabase.from('club_members').select('club_id').eq('user_id', userId)
  const clubIds = (myClubs ?? []).map((m) => m.club_id as string)
  if (clubIds.length) {
    const { data: liveEvents } = await supabase
      .from('events')
      .select('id, slug, title, club_id, status, chosen_start, confirm_deadline')
      .in('club_id', clubIds)
      .in('status', ['scheduling', 'scheduled'])
      .is('deleted_at', null)

    type LiveEvent = {
      id: string
      slug: string
      title: string
      club_id: string | null
      status: string
      chosen_start: string | null
      confirm_deadline: string | null
    }
    const live = (liveEvents ?? []) as LiveEvent[]
    if (live.length) {
      const eventIds = live.map((e) => e.id)
      const [{ data: myAvail }, { data: myRsvps }, { data: openPolls }, { data: myVotes }] = await Promise.all([
        supabase.from('availability').select('event_id').eq('user_id', userId).in('event_id', eventIds),
        supabase.from('rsvps').select('event_id').eq('user_id', userId).in('event_id', eventIds),
        supabase.from('polls').select('id, event_id, question, closes_at').in('event_id', eventIds),
        supabase.from('votes').select('option_id').eq('user_id', userId),
      ])

      const clubs = new Map<string, string>()
      const { data: clubRows } = await supabase.from('clubs').select('id, name').in('id', clubIds)
      for (const c of (clubRows ?? []) as { id: string; name: string }[]) clubs.set(c.id, c.name)

      const painted = new Set((myAvail ?? []).map((r) => r.event_id as string))
      const answered = new Set((myRsvps ?? []).map((r) => r.event_id as string))

      // votes are per option, so resolve them back to their poll before asking
      // whether this member has voted in it
      const votedOptions = new Set((myVotes ?? []).map((v) => v.option_id as string))
      const polls = (openPolls ?? []) as { id: string; event_id: string; question: string; closes_at: string | null }[]
      const pollIds = polls.map((p) => p.id)
      const { data: options } = pollIds.length
        ? await supabase.from('poll_options').select('id, poll_id').in('poll_id', pollIds)
        : { data: [] }
      const votedPolls = new Set(
        ((options ?? []) as { id: string; poll_id: string }[])
          .filter((o) => votedOptions.has(o.id))
          .map((o) => o.poll_id)
      )

      const base = (e: LiveEvent) => ({
        eventId: e.id,
        eventTitle: e.title,
        eventSlug: e.slug,
        clubName: e.club_id ? (clubs.get(e.club_id) ?? null) : null,
        // what makes one of these more urgent than another. The confirm
        // deadline if the organizer set one, else the event itself.
        dueAt: e.confirm_deadline ?? e.chosen_start ?? null,
      })

      for (const e of live) {
        if (e.status === 'scheduling' && !painted.has(e.id)) {
          board.toAnswer.push({ kind: 'answer', ...base(e), asks: 'availability' })
        }
        if (e.status === 'scheduled' && !answered.has(e.id)) {
          board.toAnswer.push({ kind: 'answer', ...base(e), asks: 'rsvp' })
        }
        for (const poll of polls.filter((p) => p.event_id === e.id)) {
          const closed = !!poll.closes_at && new Date(poll.closes_at) <= new Date()
          if (!closed && !votedPolls.has(poll.id)) {
            board.toAnswer.push({ kind: 'answer', ...base(e), asks: 'poll', pollLabel: poll.question })
          }
        }
      }
    }
  }

  // 1) debts to pay: events where my balance is negative, resolved to a
  // suggested transfer the same way the event page's Expenses panel does.
  const { data: myNeg } = await supabase
    .from('event_balances')
    .select('event_id, net_cents')
    .eq('user_id', userId)
    .lt('net_cents', 0)
  const negEventIds = [...new Set((myNeg ?? []).map((r) => r.event_id as string))]

  if (negEventIds.length > 0) {
    const [{ data: allBal }, { data: pending }, ctx] = await Promise.all([
      supabase.from('event_balances').select('event_id, user_id, net_cents').in('event_id', negEventIds),
      supabase.from('settlements').select('*').in('event_id', negEventIds).eq('confirmed', false),
      eventContext(supabase, negEventIds),
    ])
    const balRows = (allBal ?? []) as EventBalanceRow[]
    const pendingRows = (pending ?? []) as SettlementRow[]
    const userIds = [...new Set(balRows.map((b) => b.user_id))]
    const { data: users } = userIds.length
      ? await supabase.from('users').select('id, display_name').in('id', userIds)
      : { data: [] as { id: string; display_name: string }[] }
    const nameOf = new Map((users ?? []).map((u) => [u.id, u.display_name]))

    for (const eid of negEventIds) {
      const nets = netOfPending(
        balRows.filter((b) => b.event_id === eid),
        pendingRows.filter((s) => s.event_id === eid),
        (id) => nameOf.get(id) ?? '·'
      )
      const transfers = suggestTransfers(nets).filter((t) => t.from.user_id === userId)
      for (const t of transfers) {
        board.toPay.push({
          kind: 'pay',
          eventId: eid,
          eventTitle: ctx.titleOf(eid),
          eventSlug: ctx.slugOf(eid),
          clubName: ctx.clubNameOf(eid),
          toUserId: t.to.user_id,
          toName: t.to.name,
          amountCents: t.amount_cents,
        })
      }
    }
  }

  // 2) claimed payments waiting on my confirmation
  const { data: toConfirmRows } = await supabase
    .from('settlements')
    .select('*')
    .eq('to_user', userId)
    .eq('confirmed', false)
  const confirmRows = (toConfirmRows ?? []) as SettlementRow[]
  if (confirmRows.length > 0) {
    const eventIds = [...new Set(confirmRows.map((r) => r.event_id))]
    const fromIds = [...new Set(confirmRows.map((r) => r.from_user))]
    const [ctx, { data: fromUsers }] = await Promise.all([
      eventContext(supabase, eventIds),
      supabase.from('users').select('id, display_name').in('id', fromIds),
    ])
    const nameOf = new Map((fromUsers ?? []).map((u) => [u.id, u.display_name]))
    for (const s of confirmRows) {
      let proofSignedUrl: string | null = null
      if (s.proof_path) {
        const { data: signed } = await supabase.storage.from('payment-proofs').createSignedUrl(s.proof_path, 300)
        proofSignedUrl = signed?.signedUrl ?? null
      }
      board.toConfirm.push({
        kind: 'confirm',
        settlementId: s.id,
        eventId: s.event_id,
        eventTitle: ctx.titleOf(s.event_id),
        eventSlug: ctx.slugOf(s.event_id),
        clubName: ctx.clubNameOf(s.event_id),
        fromUserId: s.from_user,
        fromName: nameOf.get(s.from_user) ?? '·',
        amountCents: s.amount_cents,
        method: s.method,
        proofSignedUrl,
      })
    }
  }

  // 3) open contributions (tasks + things I'm bringing)
  const { data: contribRows } = await supabase
    .from('contributions')
    .select('id, event_id, kind, title, qty')
    .eq('assigned_to', userId)
    .eq('done', false)
  const contribs = (contribRows ?? []) as ContributionRow[]
  if (contribs.length > 0) {
    const ctx = await eventContext(
      supabase,
      [...new Set(contribs.map((c) => c.event_id))]
    )
    for (const c of contribs) {
      const item = {
        contributionId: c.id,
        eventId: c.event_id,
        eventTitle: ctx.titleOf(c.event_id),
        eventSlug: ctx.slugOf(c.event_id),
        clubName: ctx.clubNameOf(c.event_id),
        title: c.title,
        qty: c.qty,
      }
      if (c.kind === 'task') board.tasks.push({ kind: 'task', ...item })
      else board.bringing.push({ kind: 'bring', ...item })
    }
  }

  // Snoozed rows are hidden until tomorrow morning, then come back, because
  // the thing they point at is still owed.
  const { data: snoozes } = await supabase
    .from('plate_snoozes')
    .select('item_key, until')
    .eq('user_id', userId)
    .gt('until', new Date().toISOString())
  const asleep = new Set((snoozes ?? []).map((s) => s.item_key as string))
  if (asleep.size) {
    const awake = <T extends PlateItem>(rows: T[]) => rows.filter((r) => !asleep.has(plateItemKey(r)))
    board.toAnswer = awake(board.toAnswer)
    board.toPay = awake(board.toPay)
    board.toConfirm = awake(board.toConfirm)
    board.tasks = awake(board.tasks)
    board.bringing = awake(board.bringing)
  }

  return board
}

// Where you stand with each person, netted across every event you share.
// Built from the same per-event transfer suggestions the event page shows, so
// the roll-up can never disagree with the screens it summarises.
export async function getStandings(supabase: SupabaseClient, userId: string): Promise<StandingRow[]> {
  // Scoped to the events this person is actually in. It used to select the
  // whole view with no filter, which is a 4-way union over expenses, shares
  // and settlements materialized on every Home render. RLS kept it honest, but
  // two things could still go wrong with real data: the 8s statement timeout
  // would return null and getStandings swallows that, so a real debt renders
  // as "nothing pending"; and PostgREST truncating at 1000 rows would cut a
  // single event in half, so suggestTransfers would net a position set that no
  // longer sums to zero and invent a transfer for the wrong amount.
  const { data: mine } = await supabase.from('event_members').select('event_id').eq('user_id', userId)
  const eventIds = (mine ?? []).map((m) => m.event_id as string)
  if (!eventIds.length) return []

  const [{ data: balances, error }, { data: pending }] = await Promise.all([
    supabase.from('event_balances').select('event_id, user_id, net_cents').in('event_id', eventIds),
    // this roll-up used to skip pending settlements while the event page and
    // the plate list both netted them out, so after marking a payment sent the
    // item vanished from your plate and the same debt was still printed under
    // "por persona" three sections below it
    supabase
      .from('settlements')
      .select('event_id, from_user, to_user, amount_cents')
      .in('event_id', eventIds)
      .eq('confirmed', false),
  ])
  // money is the one place a swallowed error must not read as "nothing owed"
  if (error) throw new Error(error.message)
  const rows = (balances ?? []) as EventBalanceRow[]
  if (!rows.length) return []

  const pendingRows = (pending ?? []) as { event_id: string; from_user: string; to_user: string; amount_cents: number }[]
  const byEvent = new Map<string, NetPosition[]>()
  for (const eid of new Set(rows.map((r) => r.event_id))) {
    byEvent.set(
      eid,
      netOfPending(
        rows.filter((r) => r.event_id === eid),
        pendingRows.filter((s) => s.event_id === eid)
      )
    )
  }

  const net = new Map<string, { cents: number; events: Set<string> }>()
  for (const [eventId, positions] of byEvent) {
    for (const tr of suggestTransfers(positions)) {
      // negative means you owe them, positive means they owe you
      const other =
        tr.from.user_id === userId ? tr.to.user_id : tr.to.user_id === userId ? tr.from.user_id : null
      if (!other) continue
      const signed = tr.from.user_id === userId ? -tr.amount_cents : tr.amount_cents
      const cur = net.get(other) ?? { cents: 0, events: new Set<string>() }
      cur.cents += signed
      cur.events.add(eventId)
      net.set(other, cur)
    }
  }
  if (!net.size) return []

  const { data: people } = await supabase.from('users').select('id, display_name').in('id', [...net.keys()])
  const nameOf = new Map(((people ?? []) as { id: string; display_name: string }[]).map((u) => [u.id, u.display_name]))

  return [...net.entries()]
    .filter(([, v]) => v.cents !== 0)
    .map(([userId2, v]) => ({
      userId: userId2,
      name: nameOf.get(userId2) ?? '·',
      netCents: v.cents,
      events: v.events.size,
    }))
    .sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents))
}

// Home, /plate and the tab badge all count the same way, so no two surfaces
// can disagree about how much you owe.
export function plateCount(board: PlateBoard) {
  return (
    board.toAnswer.length +
    board.toPay.length +
    board.toConfirm.length +
    board.tasks.length +
    board.bringing.length
  )
}
