'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { DuplicateModal, type CarryItem } from './duplicate-modal'

// The two blocks a finished event grows, and the reason its page inverts.
//
// Before the night, the page is about deciding. After it, the page is about
// what happened, and exactly one thing on it still decays: nobody remembers
// who actually came a week later. So while the roll call is untaken it holds
// the loud slot, and the photos sit under it.
//
// Once the record exists the loud slot is free, and the honest thing to put
// in it is the question everyone asks after a good night, which is whether to
// do it again. The photos move to the top, because on a done event they are
// why anyone opens the page at all.

// "Cerrado por Marta · 1 ago". Quiet, because it is a receipt and not news.
// Falls back to the night itself for events closed before the app started
// writing this down, rather than inventing a name.
export function ClosedReceipt({ by, on, held }: { by: string | null; on: string | null; held: string | null }) {
  const when = on ?? held
  const label = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Mexico_City',
  })
  return (
    <div className="mb-3.5 flex items-center gap-2.5 rounded-md bg-cream-sunk px-3.5 py-2.5 text-[13.5px] text-ink-500">
      <Icon name="circle-check" size={15} className="flex-shrink-0 text-sage-600" />
      <span className="min-w-0 truncate">
        {by ? `Cerrado por ${by}` : 'Evento celebrado'}
        {when ? ` · ${label.format(new Date(when))}` : ''}
      </span>
    </div>
  )
}

// The loud slot once the record exists.
//
// It used to carry the faces of everyone who came and a pair of buttons,
// Duplicar and "Ahora no". Both were wrong. The faces made it look like an
// invitation being sent to those five people, which is not what the button
// does: it opens a form. And "Ahora no" is a decline button for a question
// nobody asked, on an offer that costs nothing to ignore, so it was a second
// thing to read on the way to the first.
//
// One glyph, one sentence that says exactly what carries over, one button, and
// the promise that the button does not commit you to anything. Scrolling past
// is the "no".
export function DuplicatePrompt({
  eventId,
  place,
  items,
  clubName,
  carries,
  weeks,
}: {
  eventId: string
  place: string | null
  // how many things there are to bring, named as a count because the modal is
  // where they get listed
  items: number
  clubName: string | null
  carries: CarryItem[]
  weeks: string[]
}) {
  const [confirming, setConfirming] = useState(false)

  const keeps = [place, items > 0 ? `${items} ${items === 1 ? 'cosa que traer' : 'cosas que traer'}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="mb-[26px] flex gap-3 rounded-lg border border-honey-200 bg-honey-50 p-4">
      <span
        aria-hidden="true"
        className="grid h-[38px] w-[34px] flex-shrink-0 place-items-center bg-honey-500 [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]"
      >
        <Icon name="copy" size={16} className="text-charcoal" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-bold leading-tight text-ink-900">¿Otra vez?</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-700">
          La misma noche, una semana después.{keeps ? ` Se queda con ${keeps}.` : ''} Vas a ver exactamente qué se
          lleva antes de que se cree nada.
        </p>
        {/* Opens the contract rather than creating anything. The button that
            tells an entire club about a new event is not a button you press by
            accident on the way past. */}
        <div className="mt-3.5">
          <Button block onClick={() => setConfirming(true)}>
            Duplicar este evento
          </Button>
        </div>
      </div>
      {confirming && (
        <DuplicateModal
          eventId={eventId}
          clubName={clubName}
          carries={carries}
          weeks={weeks}
          onClose={() => setConfirming(false)}
        />
      )}
    </section>
  )
}
