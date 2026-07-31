import { fmtMonthYear } from './time'

// "hace 4 días", the way the wireframes label a roster and a pending invite.
// A calendar date is precise and useless for "is this stale", which is the
// only question these two screens ask.
export function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

  if (days < 0) return 'próximamente'
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 14) return 'hace 1 semana'
  if (days < 31) return `hace ${Math.floor(days / 7)} semanas`
  if (days < 60) return 'hace 1 mes'
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`

  // past a year the month is more informative than the count
  return fmtMonthYear(iso)
}
