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
// Renders nothing for a past event, because "how soon" is not a fact about
// the past.

const TZ = 'America/Mexico_City'

// Whole days between today and the event, both read in Mexico City. Comparing
// instants would call an event at 1am tomorrow "today" for anyone awake now.
function daysUntil(iso: string, now: Date) {
  const day = (d: Date) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    return Date.parse(p.format(d))
  }
  return Math.round((day(new Date(iso)) - day(now)) / 86_400_000)
}

export type When = { label: string; tone: 'now' | 'mine' | 'info' | 'neutral'; soon: boolean } | null

export function whenPill(iso: string | null, status?: string | null, now: Date = new Date()): When {
  if (status === 'cancelled') return null
  if (!iso) return { label: 'Buscando fecha', tone: 'neutral', soon: false }
  const n = daysUntil(iso, now)
  if (Number.isNaN(n) || n < 0) return null
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
