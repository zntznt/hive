'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { pickSlot, saveAvailability } from '@/app/actions'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'

type Props = {
  eventId: string
  slug: string
  days: string[]
  timeMin: number
  timeMax: number
  slotMinutes: number
  initialSlots: number[]
  counts: Record<number, number>
  totalMembers: number
  isOrganizer: boolean
}

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function Grid({
  eventId,
  slug,
  days,
  timeMin,
  timeMax,
  slotMinutes,
  initialSlots,
  counts,
  totalMembers,
  isOrganizer,
}: Props) {
  const slotsPerDay = Math.max(1, Math.floor((timeMax - timeMin) / slotMinutes))
  const [selected, setSelected] = useState<Set<number>>(new Set(initialSlots))
  const [dirty, setDirty] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
    setDirty(true)
  }

  function save() {
    startTransition(async () => {
      await saveAvailability(eventId, slug, [...selected].sort((a, b) => a - b))
      setDirty(false)
      router.refresh()
    })
  }

  const slotDate = (idx: number) => {
    const day = days[Math.floor(idx / slotsPerDay)]
    const minutes = timeMin + (idx % slotsPerDay) * slotMinutes
    return new Date(`${day}T${hhmm(minutes)}:00`)
  }

  const best = useMemo(() => {
    return Object.entries(counts)
      .map(([idx, n]) => ({ idx: Number(idx), n }))
      .filter((s) => s.n > 0)
      .sort((a, b) => b.n - a.n || a.idx - b.idx)
      .slice(0, 3)
  }, [counts])

  function finalize(idx: number) {
    const start = slotDate(idx)
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000)
    startTransition(async () => {
      await pickSlot(eventId, slug, start.toISOString(), end.toISOString())
      router.refresh()
    })
  }

  return (
    <div>
      <p className="mb-2 text-sm text-ink-500">Toca las celdas en las que puedes. Cuanto más honey, más gente puede.</p>
      <div
        className="grid gap-[3px] text-center text-[11px] text-ink-500"
        style={{ gridTemplateColumns: `44px repeat(${days.length}, 1fr)` }}
      >
        <div />
        {days.map((d) => (
          <div key={d} className="pb-1 font-bold">
            {new Date(`${d}T00:00:00`).toLocaleDateString('es-ES', {
              weekday: 'short',
              day: 'numeric',
            })}
          </div>
        ))}
        {Array.from({ length: slotsPerDay }).map((_, t) => (
          <Fragment key={t}>
            <div className="pr-1 text-right leading-6">{hhmm(timeMin + t * slotMinutes)}</div>
            {days.map((_, d) => {
              const idx = d * slotsPerDay + t
              const n = counts[idx] ?? 0
              const alpha = n === 0 ? 0 : 0.18 + 0.62 * (n / Math.max(totalMembers, 1))
              const mine = selected.has(idx)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggle(idx)}
                  aria-label={`slot ${idx}`}
                  className={`h-6 rounded-[5px] ${mine ? 'border-2 border-charcoal' : 'border border-line-card'}`}
                  style={{ backgroundColor: alpha ? `rgba(235,169,55,${alpha})` : 'var(--paper)' }}
                />
              )
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-ink-300">tu selección = borde charcoal</span>
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? 'Zumbando…' : 'Guardar disponibilidad'}
        </Button>
      </div>

      {best.length > 0 && (
        <div className="mt-5">
          <SectionHeader>Mejores huecos</SectionHeader>
          <ul className="flex flex-col gap-1.5">
            {best.map((s) => (
              <li key={s.idx} className="flex items-center justify-between rounded-md border border-line-card bg-paper p-2 text-sm">
                <span className="text-ink-700">
                  {slotDate(s.idx).toLocaleString('es-ES', {
                    weekday: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  <span className="ml-2 text-ink-300">
                    {s.n}/{totalMembers}
                  </span>
                </span>
                {isOrganizer && (
                  <button onClick={() => finalize(s.idx)} disabled={pending} className="rounded-md border-[1.5px] border-honey-500 px-2 py-1 text-xs font-bold text-honey-700">
                    Fijar (3 h)
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
