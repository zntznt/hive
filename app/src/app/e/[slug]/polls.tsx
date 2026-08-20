import { applyPollOption, castVote, closePoll, reopenPoll } from '@/app/actions'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PollOption } from '@/components/ui/PollOption'
import { AddPollButton } from './poll-modal'
import type { StringKey } from '@/lib/lang'

type Option = { id: string; label: string; sort: number }
type Vote = { option_id: string; user_id: string }
type Poll = {
  id: string
  question: string
  kind: 'single' | 'multi'
  anonymous: boolean
  closes_at: string | null
  show_results: 'always' | 'after_close'
  applied_option_id: string | null
  created_by: string
  poll_options: Option[]
  votes: Vote[]
}

type Props = {
  tr: (k: StringKey) => string
  eventId: string
  slug: string
  myId: string
  isOrganizer: boolean
  nameOf: Map<string, string>
  polls: Poll[]
}

export default function Polls({
  tr, eventId, slug, myId, isOrganizer, nameOf, polls }: Props) {
  // A settled poll folds. It kept its card, every option and every count
  // between the bring list and the thread forever, where the kit shows one
  // openable row. Open while anything is still unanswered, because closed
  // must never hide something that needs you, which is the same rule the
  // component's own `hot` border states.
  const unanswered = polls.filter((p) => !p.votes.some((v) => v.user_id === myId))
  const winnerOf = (p: Poll) => {
    const picked = p.applied_option_id && p.poll_options.find((o) => o.id === p.applied_option_id)
    if (picked) return picked.label
    const counts = p.poll_options.map((o) => [o, p.votes.filter((v) => v.option_id === o.id).length] as const)
    const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a), counts[0])
    return best && best[1] > 0 ? best[0].label : null
  }
  const first = polls[0]
  const firstWinner = first ? winnerOf(first) : null
  const summary =
    polls.length > 1
      ? `${polls.length} · ${tr('event.polls')}`
      : first && firstWinner
        ? `${first.question} · ${firstWinner}`
        : (first?.question ?? '')

  const list = (
    <>
      <ul className="mb-4 flex flex-col gap-3">
        {polls.map((p) => {
          const opts = [...p.poll_options].sort((a, b) => a.sort - b.sort)
          const closed = !!p.closes_at && new Date(p.closes_at) <= new Date()
          const showResults = p.show_results === 'always' || closed
          const myOptionIds = new Set(p.votes.filter((v) => v.user_id === myId).map((v) => v.option_id))
          // votes.user_id is only populated for me on anonymous polls (RLS hides others),
          // so total counts come from row count, names only from non-anonymous polls.
          const countFor = (optId: string) => p.votes.filter((v) => v.option_id === optId).length
          const maxCount = Math.max(1, ...opts.map((o) => countFor(o.id)))

          return (
            <li key={p.id}>
              <Card pad="row">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="font-bold text-ink-900">{p.question}</span>
                  <span className="flex flex-shrink-0 items-center gap-2 text-xs text-ink-300">
                    {nameOf.get(p.created_by) ?? '·'}
                    {p.anonymous ? ` · ${tr('poll.anon')}` : ''}
                    {closed && <Badge>{tr('poll.closed')}</Badge>}
                    {isOrganizer && (
                      <form action={(closed ? reopenPoll : closePoll).bind(null, p.id, slug)}>
                        <button className="tap font-bold text-ink-500">{tr(closed ? 'poll.reopen' : 'poll.close')}</button>
                      </form>
                    )}
                  </span>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {opts.map((o) => {
                    const n = countFor(o.id)
                    const mine = myOptionIds.has(o.id)
                    const applied = p.applied_option_id === o.id
                    return (
                      <li key={o.id}>
                        <div className="flex items-center gap-2">
                          <form action={castVote.bind(null, p.id, o.id, slug, p.kind)} className="flex-1">
                            <button type="submit" disabled={closed} className="w-full disabled:opacity-60">
                              <PollOption label={o.label} votes={n} max={maxCount} selected={mine} chosen={applied} showResults={showResults} multi={p.kind === 'multi'} />
                            </button>
                          </form>
                          {isOrganizer && !applied && (
                            <form action={applyPollOption.bind(null, p.id, o.id, slug)}>
                              <button className="tap flex-shrink-0 text-xs font-bold text-honey-700">{tr('poll.pick')}</button>
                            </form>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {!showResults && <p className="mt-2 text-xs text-ink-300">{tr('poll.hidden')}</p>}
                {p.applied_option_id && <p className="mt-2 text-xs text-ink-500">{tr('poll.visible')}</p>}
              </Card>
            </li>
          )
        })}
      </ul>
      <AddPollButton eventId={eventId} slug={slug} />
    </>
  )

  // Nothing to fold when there are no polls: the empty state has to keep its
  // own header, or the only way to start one is behind a closed row.
  if (polls.length === 0) {
    return (
      <section className="mb-[26px]">
        <SectionHeader action={<AddPollButton eventId={eventId} slug={slug} />}>{tr('event.polls')}</SectionHeader>
        <p className="mb-3 text-sm text-ink-500">{tr('poll.empty')}</p>
      </section>
    )
  }

  return (
    <section className="mb-[26px]">
      <CollapsibleSection
        label={tr('event.polls')}
        icon="square-poll-vertical"
        summary={summary}
        defaultOpen={unanswered.length > 0}
        tone={unanswered.length > 0 ? 'hot' : undefined}
      >
        {list}
      </CollapsibleSection>
    </section>
  )
}
