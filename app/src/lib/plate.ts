import type { SupabaseClient } from '@supabase/supabase-js'
import { suggestTransfers, type NetPosition } from './settle'

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
    }

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
      .select('id, slug, title, club_id, status')
      .in('club_id', clubIds)
      .in('status', ['scheduling', 'scheduled'])

    const live = (liveEvents ?? []) as (EventRow & { status: string })[]
    if (live.length) {
      const eventIds = live.map((e) => e.id)
      const [{ data: myAvail }, { data: myRsvps }, { data: openPolls }, { data: myVotes }] = await Promise.all([
        supabase.from('availability').select('event_id').eq('user_id', userId).in('event_id', eventIds),
        supabase.from('rsvps').select('event_id').eq('user_id', userId).in('event_id', eventIds),
        supabase.from('polls').select('id, event_id, question, closes_at').in('event_id', eventIds),
        supabase.from('votes').select('option_id, user_id').eq('user_id', userId),
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

      const base = (e: EventRow & { status: string }) => ({
        eventId: e.id,
        eventTitle: e.title,
        eventSlug: e.slug,
        clubName: e.club_id ? (clubs.get(e.club_id) ?? null) : null,
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
      const adj = new Map<string, number>()
      for (const s of pendingRows.filter((s) => s.event_id === eid)) {
        adj.set(s.from_user, (adj.get(s.from_user) ?? 0) + s.amount_cents)
        adj.set(s.to_user, (adj.get(s.to_user) ?? 0) - s.amount_cents)
      }
      const nets: NetPosition[] = balRows
        .filter((b) => b.event_id === eid)
        .map((b) => ({ user_id: b.user_id, name: nameOf.get(b.user_id) ?? '·', net_cents: b.net_cents + (adj.get(b.user_id) ?? 0) }))
        .filter((n) => n.net_cents !== 0)
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

  return board
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
