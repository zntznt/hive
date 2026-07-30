'use client'

import { useState } from 'react'

// A choice between two or three named things, shown all at once.
//
// A <select> is the right control when the list is long or the options are
// data (a category, an hour). It is the wrong one when there are two options
// and the difference between them is the whole point: it hides one behind a
// tap and gives you no way to compare. Every option here is on screen, sized
// to a thumb, and carries the sentence that explains it underneath.
export function Segmented<T extends string | number>({
  name,
  label,
  hint,
  options,
  defaultValue,
  onChange,
}: {
  name: string
  label?: string
  hint?: string
  options: { value: T; label: string; note?: string }[]
  defaultValue: T
  onChange?: (v: T) => void
}) {
  const [value, setValue] = useState<T>(defaultValue)
  const active = options.find((o) => o.value === value)

  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-[12.5px] font-bold text-ink-700" htmlFor={`${name}-0`}>
          {label}
        </label>
      )}
      <input type="hidden" name={name} value={String(value)} />
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-1 rounded-md border-[1.5px] border-line-input bg-cream-sunk p-1"
      >
        {options.map((o, i) => {
          const on = o.value === value
          return (
            <button
              key={String(o.value)}
              id={`${name}-${i}`}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setValue(o.value)
                onChange?.(o.value)
              }}
              className={`h-10 flex-1 cursor-pointer rounded-[7px] px-2 text-[13px] font-extrabold leading-tight transition-colors ${
                on ? 'bg-paper text-ink-900 shadow-card' : 'text-ink-500'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {(active?.note || hint) && <p className="mt-1.5 text-xs text-ink-300">{active?.note ?? hint}</p>}
    </div>
  )
}
