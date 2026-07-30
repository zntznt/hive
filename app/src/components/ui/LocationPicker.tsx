'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon, MapPinIcon } from './Icon'

export type Place = { name: string; addr?: string; q?: string }

// Location picker with grouped type-ahead suggestions (the member's saved
// "your places" starred first, then this club's recent spots) and a live
// Google Maps preview via the keyless classic embed (maps?q=...&output=embed).
// Picking a suggestion collapses into a selected-place card with the map and
// a "Cambiar" affordance; free-typed text stays valid too. Submits as a
// plain input named `name`, so it drops into any <form action={...}>.
export function LocationPicker({
  name,
  label,
  defaultValue = '',
  saved = [],
  recent = [],
}: {
  name: string
  label?: string
  defaultValue?: string
  saved?: Place[]
  recent?: Place[]
}) {
  const all = [...saved, ...recent]
  const initialPlace = all.find((p) => p.name === defaultValue) ?? (defaultValue ? { name: defaultValue } : null)
  const [value, setValue] = useState(defaultValue)
  const [picked, setPicked] = useState<Place | null>(initialPlace)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const q = value.toLowerCase()
  const match = (p: Place) => `${p.name} ${p.addr ?? ''}`.toLowerCase().includes(q)
  const savedMatches = saved.filter(match)
  const recentMatches = recent.filter((p) => match(p) && !saved.some((s) => s.name === p.name))
  const embed = (query: string) => `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`

  function pick(p: Place) {
    setPicked(p)
    setValue(p.name)
    setOpen(false)
  }

  const groupLabel = 'block bg-paper px-[13px] pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-300'

  if (picked) {
    return (
      <div>
        {label && <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{label}</span>}
        <input type="hidden" name={name} value={picked.name} />
        <div className="overflow-hidden rounded-md border border-line-card bg-paper">
          <iframe
            title="mapa"
            src={embed(picked.q ?? picked.name)}
            className="block h-[150px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex items-start gap-2 px-[13px] py-[11px]">
            <span className="mt-0.5">
              <MapPinIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink-900">{picked.name}</span>
              {picked.addr && <span className="text-[12.5px] text-ink-500">{picked.addr}</span>}
            </span>
            <button
              type="button"
              onClick={() => {
                setPicked(null)
                setValue('')
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
          }}
          onFocus={() => setOpen(true)}
          placeholder="Casa de… o una dirección"
          className="flex-1 border-none bg-transparent py-[11px] text-sm text-ink-900 outline-none"
        />
      </div>

      {open && (savedMatches.length > 0 || recentMatches.length > 0) && (
        <div className="absolute inset-x-0 z-10 mt-1.5 overflow-hidden rounded-md border border-line-card bg-paper shadow-raised">
          {savedMatches.length > 0 && <span className={groupLabel}>Tus lugares</span>}
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
          {recentMatches.length > 0 && <span className={groupLabel}>Recientes</span>}
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
          <iframe
            title="mapa"
            src={embed(value)}
            className="block h-[150px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}
    </div>
  )
}
