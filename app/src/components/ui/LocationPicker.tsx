'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon, MapPinIcon } from './Icon'
import { PinMap, type Point } from './PinMap'
import { useT } from '@/components/ui/LangProvider'

export type Place = { name: string; addr?: string; q?: string; lat?: number | null; lng?: number | null }

// Where something is: the words for it, and the point on the map.
//
// The words are for people ("Casa de Dansc y Zeo"); the point is for the map
// and the route. This used to be words only, handed to a Google embed as a
// query string, so the preview was Google's guess at a sentence and the
// directions link was a second, independent guess at the same sentence. Two
// answers to one question, and no way to correct either.
//
// Now the pin is the answer. Typing an address geocodes it to get the pin
// near, and then the pin is dragged to say exactly. Everything downstream
// reads the coordinates when they exist, so the preview here, the map on the
// event page and the "Cómo llegar" link are the same place by construction.
//
// Submits three fields into whatever form it sits in: `name`, `name_lat` and
// `name_lng`. The two coordinates are empty when nobody has placed a pin,
// which keeps a text-only place valid.
export function LocationPicker({
  name,
  label,
  defaultValue = '',
  defaultPoint = null,
  defaultArea = null,
  saved = [],
  recent = [],
  onChange,
}: {
  name: string
  label?: string
  defaultValue?: string
  defaultPoint?: Point | null
  defaultArea?: string | null
  saved?: Place[]
  recent?: Place[]
  // for callers that need to know before submit, like the saved-places form
  // deciding whether "Guardar" is allowed yet
  onChange?: (v: { text: string; point: Point | null }) => void
}) {
  const tr = useT()
  const all = [...saved, ...recent]
  const initialPlace = all.find((p) => p.name === defaultValue) ?? (defaultValue ? { name: defaultValue } : null)
  const [value, setValue] = useState(defaultValue)
  const [picked, setPicked] = useState<Place | null>(initialPlace)
  const [point, setPoint] = useState<Point | null>(
    defaultPoint ??
      (initialPlace?.lat != null && initialPlace?.lng != null
        ? { lat: initialPlace.lat, lng: initialPlace.lng }
        : null)
  )
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  // The street the pin is standing on, resolved from the pin rather than
  // asked for. It is what the day-of header prints, and asking somebody to
  // type it under a pin they just dragged onto the right door is asking the
  // same question twice.
  const [area, setArea] = useState<string | null>(defaultArea)
  const ref = useRef<HTMLDivElement>(null)

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    onChangeRef.current?.({ text: picked?.name ?? value, point })
  }, [value, picked, point])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Typing geocodes, but only to place the pin the first time. Once somebody
  // has moved it, their correction outranks the geocoder: re-running the
  // search on the next keystroke would drag the pin back out from under them.
  const movedByHand = useRef(defaultPoint != null)
  const text = picked?.name ?? value
  useEffect(() => {
    const q = text.trim()
    if (q.length < 4 || movedByHand.current) return
    let cancelled = false
    setLocating(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
        const json = (await res.json()) as { results: { lat: number; lng: number }[] }
        if (!cancelled && json.results?.[0]) setPoint({ lat: json.results[0].lat, lng: json.results[0].lng })
      } catch {
        // leave the pin where it is
      } finally {
        if (!cancelled) setLocating(false)
      }
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(t)
      setLocating(false)
    }
  }, [text])

  const q = value.toLowerCase()
  const match = (p: Place) => `${p.name} ${p.addr ?? ''}`.toLowerCase().includes(q)
  const savedMatches = saved.filter(match)
  const recentMatches = recent.filter((p) => match(p) && !saved.some((s) => s.name === p.name))

  function pick(p: Place) {
    setPicked(p)
    setValue(p.name)
    setOpen(false)
    if (p.lat != null && p.lng != null) {
      setPoint({ lat: p.lat, lng: p.lng })
      // A saved place's pin was already placed by hand once. Re-geocoding its
      // name would throw that away the moment it is reused.
      movedByHand.current = true
    } else {
      movedByHand.current = false
    }
  }

  function drop(p: Point) {
    movedByHand.current = true
    setPoint(p)
  }

  // Whenever the pin settles, ask what street it is on. Debounced, because a
  // drag emits a point per frame and Nominatim is somebody else's service.
  useEffect(() => {
    let cancelled = false
    if (!point) {
      // Clearing the pin clears the street with it, in a callback rather than
      // in the effect body, so this does not cascade a render on every mount.
      const clear = setTimeout(() => !cancelled && setArea(null), 0)
      return () => {
        cancelled = true
        clearTimeout(clear)
      }
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?lat=${point.lat}&lng=${point.lng}`)
        const json = (await res.json()) as { area: string | null }
        if (!cancelled) setArea(json.area)
      } catch {
        // keep whatever we had; a missing street falls back to the name
      }
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [point])

  const hidden = (
    <>
      <input type="hidden" name={`${name}_lat`} value={point ? String(point.lat) : ''} />
      <input type="hidden" name={`${name}_lng`} value={point ? String(point.lng) : ''} />
      <input type="hidden" name={`${name}_area`} value={area ?? ''} />
    </>
  )

  // The line under the map, in both states. It is the only place that says
  // whether there is a pin at all, which is the difference between "the map
  // will take you here" and "the map will guess".
  const pinNote = point ? (
    <span className="flex flex-col gap-0.5 text-[11.5px] text-ink-300">
      {/* The street the pin landed on, shown so it can be checked before it is
          saved: this is the line the event page prints on the day. */}
      {area && (
        <span className="flex items-center gap-1.5 text-ink-500">
          <Icon name="location-dot" size={10} />
          {area}
        </span>
      )}
      <span>{tr('place.drag')}</span>
    </span>
  ) : (
    <span className="text-[11.5px] text-ink-300">
      {locating ? tr('place.searching') : tr('place.tapMap')}
    </span>
  )

  const groupLabel = 'block bg-paper px-[13px] pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-300'

  if (picked) {
    return (
      <div>
        {label && <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{label}</span>}
        <input type="hidden" name={name} value={picked.name} />
        {hidden}
        <div className="overflow-hidden rounded-md border border-line-card bg-paper">
          <PinMap point={point} onChange={drop} />
          <div className="flex items-start gap-2 px-[13px] py-[11px]">
            <span className="mt-0.5">
              <MapPinIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink-900">{picked.name}</span>
              {picked.addr && <span className="block text-[12.5px] text-ink-500">{picked.addr}</span>}
              <span className="mt-1 block">{pinNote}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setPicked(null)
                setValue('')
                setPoint(null)
                movedByHand.current = false
              }}
              className="tap flex-shrink-0 text-[12.5px] font-bold text-honey-700"
            >
              Cambiar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {label && <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{label}</label>}
      <div className="flex items-center gap-2 rounded-md border-[1.5px] border-line-input bg-paper px-3">
        <MapPinIcon color="var(--ink-500)" />
        <input
          name={name}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
            // A new address is a new place, so the geocoder gets to answer
            // again even if the last one was dragged.
            movedByHand.current = false
          }}
          onFocus={() => setOpen(true)}
          placeholder={tr('place.ph')}
          className="flex-1 border-none bg-transparent py-[11px] text-sm text-ink-900 outline-none"
        />
      </div>
      {hidden}

      {open && (savedMatches.length > 0 || recentMatches.length > 0) && (
        <div className="absolute inset-x-0 z-10 mt-1.5 overflow-hidden rounded-md border border-line-card bg-paper shadow-raised">
          {savedMatches.length > 0 && <span className={groupLabel}>{tr('place.yours')}</span>}
          {savedMatches.map((p, i) => (
            <button
              key={`s-${p.name}`}
              type="button"
              onClick={() => pick(p)}
              className={`min-h-11 flex w-full items-start gap-2 px-[13px] py-2.5 text-left text-[13.5px] ${i ? 'border-t border-line-divider' : ''}`}
            >
              <span className="mt-0.5 text-xs" aria-hidden="true">
                <Icon name="star" size={12} />
              </span>
              <span>
                <span className="block font-semibold text-ink-900">{p.name}</span>
                {p.addr && <span className="text-xs text-ink-500">{p.addr}</span>}
              </span>
            </button>
          ))}
          {recentMatches.length > 0 && <span className={groupLabel}>{tr('place.recent')}</span>}
          {recentMatches.map((p, i) => (
            <button
              key={`r-${p.name}`}
              type="button"
              onClick={() => pick(p)}
              className={`min-h-11 flex w-full items-start gap-2 px-[13px] py-2.5 text-left text-[13.5px] ${i ? 'border-t border-line-divider' : ''}`}
            >
              <span className="mt-0.5">
                <MapPinIcon color="var(--ink-500)" />
              </span>
              <span>
                <span className="block font-semibold text-ink-900">{p.name}</span>
                {p.addr && <span className="text-xs text-ink-500">{p.addr}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {value.trim() && (
        <div className="mt-2.5 overflow-hidden rounded-md border border-line-card">
          <PinMap point={point} onChange={drop} />
          <div className="px-[13px] py-2">{pinNote}</div>
        </div>
      )}
    </div>
  )
}
