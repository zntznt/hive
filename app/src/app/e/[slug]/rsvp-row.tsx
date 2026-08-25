'use client'

import { useState } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { rsvpButtonClass, RSVP_OPTIONS } from '@/components/ui/RsvpToggle'
import { setRsvp } from '@/app/actions'
import { useT } from '@/components/ui/LangProvider'
import type { StringKey } from '@/lib/lang'

// Your answer, after you have given it.
//
// The page used to show the three answer buttons permanently, halfway down
// "Quién va", plus a quiet line at the top saying what you had already picked.
// Two controls for one fact, and the buttons made a settled decision look like
// an open question every time you opened the page.
//
// So the answer is one row: a check, what you said, and a way to change it.
// "Cambiar" opens the same three buttons in place rather than toggling
// blindly, because there are three answers and a toggle can only reach two:
// tapping "cambiar" on "quizás" used to file you as going.

// Keys, not sentences: module-level copy freezes the first language rendered.
const FACE: Record<string, { icon: IconName; key: StringKey; tone: string; iconTone: string }> = {
  in: { icon: 'check', key: 'event.saidYouGo', tone: 'text-ink-900', iconTone: 'text-sage-600' },
  maybe: { icon: 'circle-dot', key: 'event.saidMaybe', tone: 'text-ink-900', iconTone: 'text-ink-500' },
  out: { icon: 'xmark', key: 'event.saidNo', tone: 'text-ink-500', iconTone: 'text-ink-500' },
}

export function RsvpRow({
  eventId,
  slug,
  status,
  note,
}: {
  eventId: string
  slug: string
  status: 'in' | 'maybe' | 'out'
  // "puesto 2 en la lista de espera", when there is one. It belongs on this row
  // because it is the rest of the sentence about what your "voy" got you.
  note?: string | null
}) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const face = FACE[status]

  if (open) {
    return (
      <div className="flex gap-2 rounded-lg border border-line-card bg-paper p-2">
        {RSVP_OPTIONS.map((o) => (
          <form key={o.v} action={setRsvp.bind(null, eventId, slug, o.v)} className="flex-1">
            <button className={rsvpButtonClass(status === o.v)}>{tr(o.k)}</button>
          </form>
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-h-[46px] items-center gap-2.5 rounded-md border border-line-card bg-paper px-3.5 py-2.5">
      <Icon name={face.icon} size={14} className={`flex-shrink-0 ${face.iconTone}`} />
      <span className={`min-w-0 flex-1 text-[14px] font-bold ${face.tone}`}>
        {tr(face.key)}
        {note && <span className="font-normal text-ink-500"> · {note}</span>}
      </span>
      <button onClick={() => setOpen(true)} className="tap flex-shrink-0 text-[12.5px] font-bold text-honey-700">
        {tr('common.change.lower')}
      </button>
    </div>
  )
}
