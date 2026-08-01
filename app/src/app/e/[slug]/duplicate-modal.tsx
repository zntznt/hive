'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { duplicateEvent } from '@/app/actions'
import { weekLabel } from '@/lib/duplicate-window'

// The whole feature is this modal.
//
// Tapping "Duplicar" creates a real event and tells the entire club, by mail
// and WhatsApp, immediately. So nothing here is a summary, it is a contract:
// two explicit lists, because "duplicar" reads as "everything comes with me"
// and the resets (who is coming, who claimed which item, the expenses) are the
// surprises that would otherwise land after the club has already been told.
//
// The date is a week in words, not a date field, with the picker inline:
// sending somebody to the event form to fix it would take the two lists off
// screen exactly as they are being read.
//
// The notification is the last thing before the button, because it is the one
// part that cannot be undone.

export type CarryItem = { icon: IconName; text: string }

// An empty section is never shown. An event with nothing to bring gets a
// shorter list, not a "0 cosas" row.
function List({
  tone,
  label,
  lines,
  hint,
}: {
  tone: 'keep' | 'reset'
  label: string
  lines: { icon: IconName; text: string }[]
  hint?: string
}) {
  const keep = tone === 'keep'
  return (
    <div className={`rounded-md border p-3.5 ${keep ? 'border-line-card bg-paper' : 'border-line-divider bg-cream-sunk'}`}>
      <div className="mb-2 flex items-center gap-[7px]">
        <Icon
          name={keep ? 'arrow-right-long' : 'rotate-left'}
          size={11}
          className={keep ? 'text-success' : 'text-ink-500'}
        />
        <span className={`text-[11.5px] font-extrabold uppercase tracking-[.06em] ${keep ? 'text-success' : 'text-ink-500'}`}>
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-[7px]">
        {lines.map((l) => (
          <div key={l.text} className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-700">
            <span className="mt-[3px] w-3.5 flex-shrink-0 text-center text-ink-300">
              <Icon name={l.icon} size={11} />
            </span>
            <span className="min-w-0">{l.text}</span>
          </div>
        ))}
      </div>
      {hint && <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">{hint}</p>}
    </div>
  )
}

export function DuplicateModal({
  eventId,
  clubName,
  carries,
  weeks,
  onClose,
}: {
  eventId: string
  clubName: string | null
  carries: CarryItem[]
  // the candidate weeks, first one being what the action will pick by default
  weeks: string[]
  onClose: () => void
}) {
  const [extraWeeks, setExtraWeeks] = useState(0)
  const [picking, setPicking] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const fresh: { icon: IconName; text: string }[] = [
    { icon: 'minus', text: 'Quién va, todos vuelven a confirmar' },
    { icon: 'minus', text: 'La disponibilidad, la encuesta empieza vacía' },
    { icon: 'minus', text: 'Quién trae qué, la lista pasa sin dueño' },
    { icon: 'minus', text: 'Los invitados, nadie arrastra sus +1' },
    { icon: 'minus', text: 'Gastos y balances' },
    { icon: 'minus', text: 'Las encuestas' },
  ]

  function create() {
    setError(null)
    startTransition(async () => {
      try {
        await duplicateEvent(eventId, extraWeeks)
      } catch (e) {
        // the action ends in redirect(), which works by throwing
        if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e
        setError(e instanceof Error ? e.message : 'No se pudo duplicar el evento.')
      }
    })
  }

  return (
    <Modal
      open
      onClose={pending ? undefined : onClose}
      title="Duplicar este evento"
      subtitle={clubName ? `En ${clubName}` : undefined}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={create}>
            {pending ? 'Creando…' : 'Crearlo'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {weeks.length > 0 && (
          <div className="rounded-md border-[1.5px] border-honey-500 bg-honey-50 p-3.5">
            <p className="mb-1 text-[11.5px] font-extrabold uppercase tracking-[.06em] text-honey-800">Fecha nueva</p>
            <div className="flex items-start justify-between gap-2.5">
              <p className="min-w-0 text-sm leading-relaxed text-ink-700">
                Va a buscar fecha la semana del{' '}
                <b className="text-ink-900">{weekLabel(weeks[extraWeeks] ?? weeks[0])}</b>, a la misma hora.
              </p>
              {weeks.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPicking((p) => !p)}
                  disabled={pending}
                  aria-expanded={picking}
                  className="tap -my-2.5 -mx-1 inline-flex min-h-11 flex-shrink-0 items-center px-1 text-[12.5px] font-bold text-honey-700"
                >
                  {picking ? 'Listo' : 'Cambiar'}
                </button>
              )}
            </div>
            {picking && (
              <div className="mt-2.5 border-t border-honey-200 pt-2.5">
                <p className="mb-2 text-xs text-ink-700">¿En qué semana la busca?</p>
                <div className="flex flex-wrap gap-[7px]">
                  {weeks.map((w, i) => (
                    <button
                      key={w}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setExtraWeeks(i)
                        setPicking(false)
                      }}
                      className={`tap box-border inline-flex min-h-11 items-center rounded-md border-[1.5px] bg-paper px-3 text-[13px] font-extrabold text-ink-900 ${
                        i === extraWeeks ? 'border-charcoal' : 'border-line-input'
                      }`}
                    >
                      {weekLabel(w)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">
                  El día lo siguen eligiendo los miembros dentro de esa semana. Esto solo dice dónde buscar.
                </p>
              </div>
            )}
          </div>
        )}

        <List tone="keep" label="Se mantiene" lines={carries} />

        <List
          tone="reset"
          label="Empieza de cero"
          lines={fresh}
          hint="Nadie está apuntado y nada está apartado todavía. Es lo normal en una noche nueva, no es que se haya salido todo el mundo."
        />

        {/* Last, because it is the one part that cannot be undone. */}
        <div className="flex items-start gap-2.5 rounded-md bg-warning-bg p-3.5 text-[12.5px] leading-relaxed text-warning">
          <span className="mt-0.5 flex-shrink-0">
            <Icon name="bullhorn" size={12} />
          </span>
          <span>
            Al crearlo se le avisa a todo el club de inmediato, por correo y WhatsApp. No hay paso de borrador y el
            aviso no se puede retirar.
          </span>
        </div>

        {error && <p className="rounded-md bg-danger-bg p-2.5 text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
