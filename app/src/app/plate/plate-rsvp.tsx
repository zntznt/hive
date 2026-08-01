'use client'

import { useTransition } from 'react'
import { setRsvp } from '@/app/actions'
import { RSVP_OPTIONS } from '@/components/ui/RsvpToggle'

// Answer an RSVP without leaving the plate.
//
// Every other row here either resolves in place or has somewhere it has to
// send you: a grid you paint, a poll you read the options of. "¿Vas a ir?" has
// neither. It is three words and three buttons, and routing to the event to
// press one of them turned the shortest job on the page into the longest.
//
// The three answers come from RSVP_OPTIONS, the same list the event page
// counts with, so the plate cannot invent a fourth or rename one.
//
// Voy and no voy retire the row. Quizás keeps it, because it is the one answer
// that still leaves the organizer waiting, and the button stays lit so the row
// says what you have already said rather than asking again from scratch.
export function PlateRsvp({
  eventId,
  slug,
  mine,
}: {
  eventId: string
  slug: string
  mine: 'in' | 'maybe' | 'out' | null
}) {
  const [pending, startTransition] = useTransition()

  return (
    <span className="flex flex-shrink-0 gap-1">
      {RSVP_OPTIONS.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => void (await setRsvp(eventId, slug, o.v)))}
          className={`tap min-h-11 rounded-pill px-2.5 text-[12px] font-bold disabled:opacity-60 ${
            mine === o.v ? 'bg-honey-500 text-charcoal' : 'border border-line-card bg-paper text-ink-700'
          }`}
        >
          {o.l}
        </button>
      ))}
    </span>
  )
}
