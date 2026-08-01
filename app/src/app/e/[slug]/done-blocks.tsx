'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { FaceStack } from '@/components/ui/FaceStack'
import { type AvatarUser } from '@/components/ui/Avatar'
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

// The loud slot once the record exists. It carries the faces, because the
// offer is not "make another event", it is "these five, again".
export function DuplicatePrompt({
  eventId,
  faces,
  total,
  place,
  clubName,
  carries,
  weeks,
}: {
  eventId: string
  faces: AvatarUser[]
  total: number
  place: string | null
  clubName: string | null
  carries: CarryItem[]
  weeks: string[]
}) {
  const [dismissed, setDismissed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (dismissed) return null

  return (
    <section className="mb-[26px] rounded-lg border-[1.5px] border-honey-500 bg-honey-50 p-4">
      <div className="flex items-start justify-between gap-2.5">
        <h2 className="font-display text-lg font-bold leading-tight text-ink-900">¿Otra vez en dos semanas?</h2>
        <FaceStack people={faces} total={total} size={26} max={5} />
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-700">
        {place ? `Mismo lugar (${place}), la misma gente` : 'La misma gente'}, y la lista de traer empieza en blanco.
      </p>
      {/* Opens the contract rather than creating anything. The button that
          tells an entire club about a new event is not a button you press by
          accident on the way past. */}
      <div className="mt-3.5 flex gap-2.5">
        <Button onClick={() => setConfirming(true)}>Duplicar</Button>
        <Button variant="secondary" onClick={() => setDismissed(true)}>
          Ahora no
        </Button>
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
