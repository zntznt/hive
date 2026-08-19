'use client'

import { useState, useTransition } from 'react'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { FaceStack } from '@/components/ui/FaceStack'
import { Button } from '@/components/ui/Button'
import { useT, useTf } from '@/components/ui/LangProvider'
import { remindNonResponders } from '@/app/actions'

// The people who have not answered, by name, with the one move that helps.
//
// This was a honey-coloured sentence inside the attendee card: "Ana y Diego no
// han dicho". True, but an organizer reading it has to go and chase two people
// by hand, and the app already has an action that does exactly that. It was
// written, tested, and wired to nothing.
//
// A no is an answer. Silence is not, and it is the only thing on a scheduled
// event that still needs someone to act, so it gets its own block: who, what
// silence means here, and the chase.

export function PendingAnswers({
  eventId,
  slug,
  people,
  canRemind,
}: {
  eventId: string
  slug: string
  people: { id: string; name: string; user: AvatarUser }[]
  canRemind: boolean
}) {
  const tr = useT()
  const tf = useTf()
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  if (people.length === 0) return null

  return (
    <section className="mb-[26px]">
      <p className="eyebrow mb-2.5">{tr('event.pendingAnswers')}</p>
      <div className="flex flex-col gap-2.5 rounded-lg border border-line-card bg-paper p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="min-w-0 flex-1 font-display text-[19px] font-bold leading-[1.2] text-ink-900">
            {people.length === 1 ? tr('event.notAnswered1') : tf('event.notAnsweredN', { n: people.length })}
          </span>
          <FaceStack people={people.map((p) => p.user)} total={people.length} size={25} max={5} />
        </div>
        {/* What silence is not: it is not a no, and it is not a maybe. Spelling
            that out is the difference between chasing people and re-reading a
            count. */}
        <p className="text-[13px] text-ink-500">{tr('event.pending.none')}</p>
        <div className="flex flex-col gap-1.5">
          {people.map((p) => (
            <span
              key={p.id}
              className="flex min-h-11 items-center gap-2.5 rounded-md border border-line-card bg-paper px-3 text-[13.5px] font-bold text-ink-900"
            >
              <UserAvatar user={p.user} size={24} />
              {p.name}
            </span>
          ))}
        </div>
        {canRemind &&
          (sent ? (
            // One nudge per person per event, ever, is a rule the server keeps.
            // The button says so rather than letting an organizer tap it four
            // times wondering whether anything left the building.
            <p className="text-[12.5px] text-ink-500">{tr('event.pending.reminded')}</p>
          ) : (
            <Button
              block
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await remindNonResponders(eventId, slug)
                  setSent(true)
                })
              }
            >
              {tr(pending ? 'grid.sending' : 'grid.remindAll')}
            </Button>
          ))}
      </div>
    </section>
  )
}
