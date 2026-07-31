'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { pickSlot, saveAvailability, remindMissingAvailability } from '@/app/actions'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Icon } from '@/components/ui/Icon'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { mexicoInstant, mexicoDay, fmtWeekdayDay, fmtTime } from '@/lib/time'

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
  // members who have not painted anything at all, with their faces, so the
  // organizer sees who they are waiting on rather than a number
  waitingOn: { id: string; user: AvatarUser }[]
}

// One gesture, two meanings. Press a cell, drag down the day, release.
//
// The drag never leaves the column it started in, previews as one outlined
// block, and commits on release. Marking your own time, a run adds to your
// marks, or wipes them if you started on one of your own. Picking the time,
// the run is the selection and replaces whatever was there, at any start and
// any length.
//
// Saving is automatic on release. The old grid made you paint cell by cell and
// then find a button, so a member who painted and left saved nothing at all.
// Pinning used to force a three hour block from one of three suggestions,
// which meant the app decided how long your evening was.

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

type Drag = { day: number; from: number; to: number; erasing: boolean }

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
  waitingOn,
}: Props) {
  const rows = Math.max(1, Math.floor((timeMax - timeMin) / slotMinutes))
  const [selected, setSelected] = useState<Set<number>>(new Set(initialSlots))
  const [failed, setFailed] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [mode, setMode] = useState<'paint' | 'pick'>('paint')
  const [pick, setPick] = useState<{ day: number; a: number; b: number } | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const [nudged, setNudged] = useState(false)
  const surface = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const toast = useToast()

  // The server is the truth about what is saved. This used to be seeded once
  // at mount and never again, so after router.refresh() the grid kept drawing
  // the client's own set no matter what had actually landed, and a second tab
  // (or a second device) would overwrite the first on its next save.
  //
  // Adjusted during render rather than in an effect, which is the pattern for
  // state that follows a prop: an effect would paint the stale set once first.
  // Skipped mid-gesture and mid-save so it cannot yank cells from under a
  // finger or undo a write still in flight.
  const serverSlots = initialSlots.join(',')
  const [seenSlots, setSeenSlots] = useState(serverSlots)
  if (serverSlots !== seenSlots && !drag && !pending) {
    setSeenSlots(serverSlots)
    setSelected(new Set(initialSlots))
  }

  const idx = (day: number, row: number) => day * rows + row
  // The instant this cell means in Mexico City. It used to be built from a
  // bare "2026-08-06T20:00:00", which the language reads as the device's own
  // local time, so an organizer whose phone was not on Mexico City time pinned
  // a different hour than the one written on the grid they were dragging.
  const slotDate = (day: number, row: number) => mexicoInstant(days[day], timeMin + row * slotMinutes)

  // Where the pointer is, whatever the input device. Reading the element under
  // the finger beats per-cell enter handlers, which touch does not fire.
  function cellAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-day]')
    if (!el) return null
    return { day: Number(el.dataset.day), row: Number(el.dataset.row) }
  }

  function onDown(e: React.PointerEvent) {
    // left button or a first finger only. A right-click on one of your own
    // marks used to erase it and save, and a second finger overwrote the
    // first gesture's start cell.
    if (e.button !== 0 || !e.isPrimary || drag) return
    const at = cellAt(e.clientX, e.clientY)
    if (!at) return
    surface.current?.setPointerCapture(e.pointerId)
    setSaved(false)
    setDrag({
      day: at.day,
      from: at.row,
      to: at.row,
      // erase only when marking your own time, and only when the gesture
      // starts on something you already marked
      erasing: mode === 'paint' && selected.has(idx(at.day, at.row)),
    })
  }

  function onMove(e: React.PointerEvent) {
    if (!drag) return
    const at = cellAt(e.clientX, e.clientY)
    // stay in the column the gesture started in
    if (!at || at.day !== drag.day) return
    if (at.row !== drag.to) setDrag({ ...drag, to: at.row })
  }

  function onUp() {
    if (!drag) return
    const [a, b] = drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from]

    if (mode === 'pick') {
      setPick({ day: drag.day, a, b })
      setDrag(null)
      return
    }

    const next = new Set(selected)
    for (let r = a; r <= b; r++) {
      const i = idx(drag.day, r)
      if (drag.erasing) next.delete(i)
      else next.add(i)
    }
    setDrag(null)
    setSelected(next)
    setFailed(false)
    startTransition(async () => {
      try {
        await saveAvailability(eventId, slug, [...next].sort((x, y) => x - y))
        setSaved(true)
        router.refresh()
      } catch {
        // the cells are already painted, so silence here reads exactly like a
        // successful save. Put the marks back and say so.
        setFailed(true)
        setSaved(false)
        setSelected(new Set(initialSlots))
      }
    })
  }

  // Release is handled only here, never on the element as well. Pointer
  // capture sends the event to the container and it then bubbles to window,
  // so having both would commit the same run twice and save it twice. This
  // also catches a gesture that ends outside the grid, which would otherwise
  // be silently lost.
  useEffect(() => {
    if (!drag) return
    const end = () => onUp()
    // pointercancel means the system took the gesture away (an edge swipe, a
    // long-press menu, an incoming call). That is abandon, not release, and
    // committing it wrote a half-finished run to the server.
    const abandon = () => setDrag(null)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', abandon)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', abandon)
    }
  })

  const inDrag = (day: number, row: number) => {
    if (!drag || drag.day !== day) return false
    const [a, b] = drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from]
    return row >= a && row <= b
  }
  const inPick = (day: number, row: number) =>
    mode === 'pick' && !!pick && pick.day === day && row >= pick.a && row <= pick.b

  const best = useMemo(() => {
    // Contiguous runs, not single cells. Three separate rows of the same good
    // evening is not three suggestions.
    const runs: { day: number; a: number; b: number; n: number }[] = []
    for (let d = 0; d < days.length; d++) {
      let start = -1
      let low = Infinity
      for (let r = 0; r <= rows; r++) {
        const n = r < rows ? (counts[idx(d, r)] ?? 0) : 0
        if (n > 0) {
          if (start === -1) start = r
          low = Math.min(low, n)
        } else if (start !== -1) {
          runs.push({ day: d, a: start, b: r - 1, n: low })
          start = -1
          low = Infinity
        }
      }
    }
    return runs.sort((x, y) => y.n - x.n || y.b - y.a - (x.b - x.a)).slice(0, 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, days.length, rows])

  function commitPick(day: number, a: number, b: number) {
    const start = slotDate(day, a)
    const end = new Date(slotDate(day, b).getTime() + slotMinutes * 60_000)
    startTransition(async () => {
      try {
        await pickSlot(eventId, slug, start.toISOString(), end.toISOString())
        router.refresh()
      } catch {
        setFailed(true)
      }
    })
  }

  const marked = selected.size

  return (
    <div>
      {isOrganizer && (
        <div className="mb-2.5 flex gap-1 rounded-pill bg-cream-sunk p-1">
          {(['paint', 'pick'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-10 flex-1 rounded-pill text-[12.5px] font-bold ${
                mode === m ? 'bg-paper text-ink-900 shadow-card' : 'text-ink-500'
              }`}
            >
              {m === 'paint' ? 'Marcar la mía' : 'Fijar la hora'}
            </button>
          ))}
        </div>
      )}

      <p className="mb-1 text-sm text-ink-500">
        {mode === 'pick'
          ? 'Arrastra sobre el día para elegir el rango exacto.'
          : 'Mantén y arrastra sobre un día. Cuanto más honey, más gente puede.'}
      </p>
      <p className="mb-2 text-[11.5px] text-ink-300">
        <Icon name="globe" size={10} /> Horario de Ciudad de México (GMT-6)
      </p>

      <div
        ref={surface}
        onPointerDown={onDown}
        onPointerMove={onMove}
        className="grid touch-none select-none gap-[3px] text-center text-[11px] text-ink-500"
        style={{ gridTemplateColumns: `44px repeat(${days.length}, 1fr)` }}
      >
        <div />
        {days.map((d) => (
          <div key={d} className="pb-1 font-bold">
            {fmtWeekdayDay(mexicoDay(d))}
          </div>
        ))}
        {Array.from({ length: rows }).map((_, r) => {
          const minutes = timeMin + r * slotMinutes
          const onHour = minutes % 60 === 0
          return (
            <Fragment key={r}>
              {/* half hours stay labelled, just quieter, so a 30 minute grid
                  does not read as half its rows being unavailable */}
              <div className={`pr-1 text-right leading-6 ${onHour ? '' : 'text-ink-300'}`}>{hhmm(minutes)}</div>
              {days.map((_, d) => {
                const i = idx(d, r)
                const n = counts[i] ?? 0
                const alpha = n === 0 ? 0 : 0.18 + 0.62 * (n / Math.max(totalMembers, 1))
                const mine = mode === 'paint' && selected.has(i)
                const preview = inDrag(d, r)
                const picked = inPick(d, r)
                return (
                  <button
                    key={i}
                    type="button"
                    data-day={d}
                    data-row={r}
                    aria-label={`${days[d]} ${hhmm(minutes)}`}
                    className={`h-6 rounded-[5px] ${
                      picked || preview
                        ? 'border-2 border-charcoal'
                        : mine
                          ? 'border-2 border-charcoal'
                          : 'border border-line-card'
                    }`}
                    style={{ backgroundColor: alpha ? `rgba(235,169,55,${alpha})` : 'var(--paper)' }}
                  />
                )
              })}
            </Fragment>
          )
        })}
      </div>

      {/* a save that failed used to read exactly like one that worked: the
          cells stayed painted and the caption just dropped the word
          "guardando". Failure gets its own colour and its own sentence. */}
      {failed ? (
        <p className="mt-2.5 text-[11.5px] font-bold text-danger">
          No se pudo guardar. Revisa tu conexión y vuelve a marcar.
        </p>
      ) : (
        <p className="mt-2.5 text-[11.5px] text-ink-300">
          {mode === 'pick'
            ? pick
              ? `${days[pick.day]} · ${hhmm(timeMin + pick.a * slotMinutes)} a ${hhmm(timeMin + (pick.b + 1) * slotMinutes)}`
              : 'Nada elegido todavía.'
            : `${marked} ${marked === 1 ? 'hueco marcado' : 'huecos marcados'}${
                pending ? ' · guardando…' : saved ? ' · guardado' : ''
              }`}
        </p>
      )}

      {mode === 'pick' && pick && (
        <button
          type="button"
          disabled={pending}
          onClick={() => commitPick(pick.day, pick.a, pick.b)}
          className="mt-2 w-full rounded-md bg-honey-500 py-3 text-sm font-extrabold text-charcoal shadow-lip disabled:opacity-50"
        >
          Fijar este rango
        </button>
      )}

      {/* The one thing an organizer running a poll actually needs. Faces
          rather than a count, because "waiting on 3" is a statistic and
          "waiting on Marta, Jorge and Lucía" is a decision. */}
      {isOrganizer && waitingOn.length > 0 && (
        <div className="mt-5 rounded-lg border border-line-card bg-paper p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-bold text-ink-900">
              Faltan {waitingOn.length} de {totalMembers}
            </span>
            <button
              type="button"
              disabled={pending || nudged}
              onClick={() =>
                startTransition(async () => {
                  const res = await remindMissingAvailability(eventId, slug)
                  setNudged(true)
                  toast(
                    res.queued > 0
                      ? `Les recordamos a ${res.queued}`
                      : 'Ya les habíamos recordado'
                  )
                  router.refresh()
                })
              }
              className="tap flex-shrink-0 rounded-md border-[1.5px] border-honey-500 px-2.5 py-1 text-xs font-bold text-honey-700 disabled:opacity-50"
            >
              <Icon name="paper-plane" size={11} /> {nudged ? 'Recordado' : 'Recordarles'}
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {waitingOn.map((m) => (
              <span key={m.id} className="flex items-center gap-1.5 rounded-pill bg-cream-sunk py-0.5 pl-0.5 pr-2.5">
                <UserAvatar user={m.user} size={22} />
                <span className="text-[12px] font-semibold text-ink-700">{m.user.display_name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {mode === 'pick' && best.length > 0 && (
        <div className="mt-5">
          <SectionHeader>Mejores huecos</SectionHeader>
          <ul className="flex flex-col gap-1.5">
            {best.map((s) => (
              <li
                key={`${s.day}-${s.a}`}
                className="flex items-center justify-between rounded-md border border-line-card bg-paper p-2 text-sm"
              >
                <span className="text-ink-700">
                  {fmtWeekdayDay(slotDate(s.day, s.a))} {fmtTime(slotDate(s.day, s.a))}
                  {' a '}
                  {hhmm(timeMin + (s.b + 1) * slotMinutes)}
                  <span className="ml-2 text-ink-300">
                    {s.n}/{totalMembers}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setPick({ day: s.day, a: s.a, b: s.b })}
                  className="tap rounded-md border-[1.5px] border-honey-500 px-2 py-1 text-xs font-bold text-honey-700"
                >
                  Usar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
