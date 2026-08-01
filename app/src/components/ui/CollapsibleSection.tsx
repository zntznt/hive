'use client'

import { useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

// A section that reports itself instead of showing itself.
//
// Not a door. A door goes somewhere and wears chevron-right; this opens in
// place and wears chevron-down. Ten pixels of chevron direction is the only
// thing telling the two apart, so getting it backwards teaches the wrong
// lesson about every chevron in the app.
//
// `summary` is a node, and that is the whole reason this exists. A closed row
// shows people: faces where there are faces, a name where there is one name, a
// sentence where there are words. A count is the fallback, never the format.
//
// The caller decides what starts open. Short things and unfinished things stay
// expanded, and this component never guesses from how much content it was
// handed. There is no re-arming either: once someone opens or closes it, it
// stays that way, because a page that changes shape on its own cannot be
// learned.
//
// Open, the hide control carries no glyph. The vocabulary gives a trailing
// chevron to things that navigate and nothing to things that act here, and
// hiding a section acts here. (The kit draws a chevron-up, which is not in the
// ratified set.)

export function CollapsibleSection({
  label,
  summary,
  icon,
  tone,
  defaultOpen = false,
  children,
  className = '',
}: {
  label: string
  // What the row says about itself, closed and open alike. There used to be a
  // second prop for the open state, which meant a caller could pass the one
  // the closed row does not read and get a row reporting nothing at all.
  summary?: ReactNode
  icon?: IconName
  tone?: 'hot'
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hot = tone === 'hot'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className={`tap flex min-h-[46px] w-full items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-left ${
          // honey border when something in here is still owed, so closed never
          // hides a thing that needs you
          hot ? 'border-honey-500 bg-honey-50' : 'border-line-card bg-paper'
        } ${className}`}
      >
        {icon && (
          <Icon name={icon} size={13} className={`w-[15px] flex-shrink-0 ${hot ? 'text-honey-800' : 'text-ink-300'}`} />
        )}
        <span className="flex-shrink-0 text-[13.5px] font-bold text-ink-900">{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden text-xs text-ink-500">
          {summary}
        </span>
        <Icon name="chevron-down" size={10} className="flex-shrink-0 text-ink-300" />
      </button>
    )
  }

  return (
    <div className={className}>
      {/* Open, the header goes quiet: type does the shaping the chevron was
          doing, and the only control left is the way back to closed. */}
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <span className="eyebrow">{label}</span>
        {summary && <span className="min-w-0 truncate text-[11.5px] text-ink-300">{summary}</span>}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="tap -my-[11px] ml-auto inline-flex min-h-11 items-center px-1 text-xs font-bold text-honey-800"
        >
          Ocultar
        </button>
      </div>
      {children}
    </div>
  )
}
