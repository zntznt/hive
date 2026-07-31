import { Badge } from './Badge'
import { Icon } from './Icon'

// The one way this app says WHEN.
//
// There were five: the clubs list said "hoy / mañana / viernes", Home said
// "vie, 9 ago", search said "9 ago", the club page said "9 ago" from a third
// function, and each drifted on its own. Every list of events and every list
// of clubs renders this instead, so "hoy" looks identical everywhere and the
// eye learns one shape rather than four.
//
// It is a Badge, not a new pill: proximity picks the tone and nothing else.
//
// A past event gets a plain date rather than a proximity, because "how soon"
// is not a fact about the past. Returning nothing at all was wrong: /events is
// the history browser, so every past row lost its date entirely.

const TZ = 'America/Mexico_City'

// Whole days between today and the event, both read in Mexico City. Comparing
// instants would call an event at 1am tomorrow "today" for anyone awake now.
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function daysUntil(iso: string, now: Date) {
  // Intl.format throws RangeError on an invalid Date rather than returning
  // something NaN-ish, so the parse is checked here instead of downstream.
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return NaN
  const day = (d: Date) => Date.parse(DAY.format(d))
  return Math.round((day(at) - day(now)) / 86_400_000)
}

function shortDate(d: Date) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: TZ }).format(d)
}

export type When = { label: string; tone: 'now' | 'mine' | 'info' | 'neutral'; soon: boolean; past?: boolean } | null

export function whenPill(iso: string | null, status?: string | null, now: Date = new Date()): When {
  if (status === 'cancelled') return null
  if (!iso) return { label: 'Buscando fecha', tone: 'neutral', soon: false }
  const n = daysUntil(iso, now)
  if (Number.isNaN(n)) return null
  const d0 = new Date(iso)
  if (n < 0) return { label: shortDate(d0), tone: 'neutral', soon: false, past: true }
  if (n === 0) return { label: 'Hoy', tone: 'now', soon: true }
  if (n === 1) return { label: 'Mañana', tone: 'mine', soon: true }
  const d = new Date(iso)
  if (n < 7) {
    const long = new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: TZ }).format(d)
    return { label: long.replace(/^./, (c) => c.toUpperCase()), tone: 'info', soon: false }
  }
  return {
    label: new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: TZ }).format(d),
    tone: 'neutral',
    soon: false,
  }
}

export function WhenPill({
  at,
  status,
  icon = false,
  className,
}: {
  at: string | null
  status?: string | null
  icon?: boolean
  className?: string
}) {
  const p = whenPill(at, status)
  if (!p) return null
  return (
    <Badge tone={p.tone} className={className}>
      {icon && <Icon name={p.soon ? 'clock' : 'calendar-day'} size={9.5} />}
      {p.label}
    </Badge>
  )
}
