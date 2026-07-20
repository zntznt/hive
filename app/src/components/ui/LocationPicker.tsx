'use client'

import { useState, useRef, useEffect } from 'react'
import { MapPinIcon } from './Icon'

export type Place = { name: string; addr?: string; q?: string }

// Text input with type-ahead suggestions (recent places from this club) and a
// live Google Maps preview, using the keyless classic embed
// (maps?q=...&output=embed) - no API key needed. Submits as a plain text
// input named `name`, so it drops into any existing <form action={...}> that
// reads FormData, no client-side form wiring required from the caller.
export function LocationPicker({
  name,
  label,
  defaultValue = '',
  recent = [],
}: {
  name: string
  label?: string
  defaultValue?: string
  recent?: Place[]
}) {
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const matches = recent.filter((p) => p.name.toLowerCase().includes(value.toLowerCase()))
  const embed = (q: string) => `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`

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

      {open && matches.length > 0 && (
        <div className="absolute inset-x-0 z-10 mt-1.5 overflow-hidden rounded-md border border-line-card bg-paper shadow-raised">
          {matches.map((p, i) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setValue(p.name)
                setOpen(false)
              }}
              className={`flex w-full items-start gap-2 px-[13px] py-2.5 text-left text-[13.5px] ${i ? 'border-t border-line-divider' : ''}`}
            >
              <span className="mt-0.5">⭐</span>
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
