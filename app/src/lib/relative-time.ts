import { t as translate, tf as format, type Lang, type StringKey } from './lang'
import { fmtMonthYear } from './time'

// "hace 4 días", the way the wireframes label a roster and a pending invite.
// A calendar date is precise and useless for "is this stale", which is the
// only question these two screens ask.
export function timeAgo(iso: string | null, lang: Lang = 'es'): string {
  const t = (k: StringKey) => translate(lang, k)
  const f = (k: StringKey, v: Record<string, string | number>) => format(lang, k, v)
  if (!iso) return t('time.never')
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

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
