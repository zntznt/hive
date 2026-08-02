import { t, tf, type Lang } from './lang'
import { daysBetween } from './time'

// How old a debt is, and what that buys it.
//
// Money on this page sorts by age, not by amount and not by when the row
// landed. A small old debt outranks a large new one, which means the loud
// number is often the least impressive on the page. That is the point: the
// thing that makes a debt worth chasing is that it has been sitting there,
// not that it is big.
//
// Thirty days is the line. Past it, a debt stops being a row in a list and
// takes the loud slot with the person's face on it, because at that point you
// are not paying six pesos, you are paying Marta.

export const STALE_DAYS = 30

// Calendar days in Mexico City, from `daysBetween`, and not a division here.
// A debt held since 23:00 last night is a day old on this page the moment the
// date rolls over, which is when the person holding it starts feeling it.
export function ageInDays(heldAt: string | null, now: Date = new Date()): number | null {
  if (!heldAt) return null
  const days = daysBetween(heldAt, now)
  if (Number.isNaN(days)) return null
  return days < 0 ? 0 : days
}

// "hace 55 días", "hoy", "ayer". The phrase carries the weight, so it is
// written out rather than left as a date the reader has to subtract from.
//
// The words are `time.*`, the same table `timeAgo` reads. They used to be a
// second `age.*` set, byte-identical in both languages, so a translator could
// change "hoy" on the roster and not on /plate. This function still exists
// because it says "hace 55 días" where `timeAgo` would round that to "hace 1
// mes", and on this page the count is the whole point. The vocabulary is
// shared; only the rounding differs.
export function ageLabel(days: number | null, lang: Lang = 'es'): string | null {
  if (days == null) return null
  if (days === 0) return t(lang, 'time.today')
  if (days === 1) return t(lang, 'time.yesterday')
  return tf(lang, 'time.daysAgo', { n: days })
}

// Oldest first, and a debt with no date sorts last: it cannot be chased on an
// age it does not have. Amount breaks ties so two debts from the same night
// keep a stable order rather than shuffling between renders.
export function byAge<T extends { heldAt: string | null; amountCents: number }>(a: T, b: T): number {
  const ta = a.heldAt ? Date.parse(a.heldAt) : Number.POSITIVE_INFINITY
  const tb = b.heldAt ? Date.parse(b.heldAt) : Number.POSITIVE_INFINITY
  return ta - tb || b.amountCents - a.amountCents
}
