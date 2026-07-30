import { type HTMLAttributes, type ReactNode } from 'react'

// The app's ONE status pill. Anything that labels the state of a thing (going,
// waitlist, admin, settled, cancelled, closed, invited) is a Badge, so two
// states of the same thing can never be two different shapes. Things you pick
// (filters, category pickers) are Chip instead; a Badge is never clickable.
//
// Tones are semantic: neutral (a fact), mine (about you or your role), info (a
// category or a scope), success (done), warning (waiting on someone), danger
// (off, cancelled, blocked), now (it is today).
const SKIN = {
  neutral: 'bg-cream-sunk text-ink-500',
  mine: 'bg-honey-100 text-honey-800',
  // the loudest rung, for the one thing on a card that is happening today.
  // Same honey as Chip's solid variant, so it adds weight rather than a colour.
  now: 'bg-honey-500 text-charcoal',
  info: 'bg-sage-100 text-sage-600',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
}

// Earlier names, kept so older screens keep rendering.
const ALIASES = {
  admin: 'mine',
  honey: 'mine',
  sage: 'info',
  active: 'success',
  pending: 'warning',
  disabled: 'danger',
} as const

export type BadgeTone = keyof typeof SKIN | keyof typeof ALIASES

export function Badge({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; children: ReactNode }) {
  const key = (tone in SKIN ? tone : ALIASES[tone as keyof typeof ALIASES]) as keyof typeof SKIN
  return (
    <span
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-pill border-[1.5px] border-transparent px-2.5 py-[3px] text-[11px] font-bold leading-relaxed ${SKIN[key] ?? SKIN.neutral} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}
