import { t as translate, tf as format, type Lang, type StringKey } from './lang'
import { daysBetween, fmtMonthYear } from './time'

// "hace 4 días", the way the wireframes label a roster and a pending invite.
// A calendar date is precise and useless for "is this stale", which is the
// only question these two screens ask.
//
// The counting is `daysBetween`, in time.ts, and not a division here: this
// used to floor elapsed milliseconds in whatever zone the runtime happened to
// be in, which disagreed with every other date on the page. See the note there.
export function timeAgo(iso: string | null, lang: Lang = 'es', now: Date = new Date()): string {
  const t = (k: StringKey) => translate(lang, k)
  const f = (k: StringKey, v: Record<string, string | number>) => format(lang, k, v)
  if (!iso) return t('time.never')
  const days = daysBetween(iso, now)
  if (Number.isNaN(days)) return t('time.never')

  if (days < 0) return t('time.soon')
  if (days === 0) return t('time.today')
  if (days === 1) return t('time.yesterday')
  if (days < 7) return f('time.daysAgo', { n: days })
  if (days < 14) return t('time.weekAgo')
  if (days < 31) return f('time.weeksAgo', { n: Math.floor(days / 7) })
  if (days < 60) return t('time.monthAgo')
  if (days < 365) return f('time.monthsAgo', { n: Math.floor(days / 30) })

  // past a year the month is more informative than the count
  return fmtMonthYear(iso, lang)
}
