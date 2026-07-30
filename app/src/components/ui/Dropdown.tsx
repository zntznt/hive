'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, CheckIcon } from './Icon'

export type DropdownOption = { value: string; label: string }

// Styled dropdown replacing the OS-native select where the menu is
// user-facing (category pickers). Honey focus ring, paper popover, check on
// the current value, closes on outside pointerdown. Submits like a plain
// form field via the hidden input when `name` is given.
export function Dropdown({
  name,
  label,
  value,
  onChange,
  options,
  placeholder = 'Elige…',
  disabled = false,
}: {
  name?: string
  label?: string
  value: string
  onChange: (v: string) => void
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [])

  const cur = options.find((o) => o.value === value)

  return (
    <div ref={ref} className="relative">
      {label && <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{label}</span>}
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border-[1.5px] bg-paper px-[13px] py-[11px] text-left text-sm ${
          open ? 'border-honey-500' : 'border-line-input'
        } ${cur && cur.value !== '' ? 'text-ink-900' : 'text-ink-300'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
      >
        <span className="truncate">{cur ? cur.label : placeholder}</span>
        <ChevronDownIcon className={`flex-shrink-0 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute inset-x-0 z-[60] mt-1.5 max-h-60 overflow-y-auto rounded-md border border-line-card bg-paper shadow-raised">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={`flex min-h-11 w-full items-center justify-between gap-2 px-[13px] py-2.5 text-left text-sm text-ink-900 ${
                o.value === value ? 'bg-honey-50' : ''
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <CheckIcon className="flex-shrink-0 text-honey-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
