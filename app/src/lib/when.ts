// When something is, in words. The one function that decides it, so no two
// surfaces can disagree.
//
// It lives in lib/ rather than beside the component because the component is a
// client component (it reads the language from context) and server components
// call this directly. A client module cannot be called from the server, and
// the search page did exactly that.
import { t as translate, type Lang } from './lang'
import { MX_TZ, daysBetween } from './time'

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

// Whole days between today and the event, both read in Mexico City. Comparing
// instants would call an event at 1am tomorrow "today" for anyone awake now.
//
// The counting is `daysBetween` in time.ts, which measures the past, so this
// is that with the sign flipped. There is one calendar-day subtraction in this
// app and this is not a second copy of it.
const daysUntil = (iso: string, now: Date) => -daysBetween(iso, now)

// The date formats follow the language too. A pill reading "Nov 3" beside an
// English row is right; "3 nov" beside it is a leak.
const locale = (lang: Lang) => (lang === 'en' ? 'en-US' : 'es-MX')

function shortDate(d: Date, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', timeZone: MX_TZ }).format(d)
}

export type When = { label: string; tone: 'now' | 'mine' | 'info' | 'neutral'; soon: boolean; past?: boolean } | null

// `lang` defaults to Spanish so a caller that has not been given a language
// still gets the app's own language rather than a key or an empty pill.
export function whenPill(iso: string | null, status?: string | null, now: Date = new Date(), lang: Lang = 'es'): When {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k)
  if (status === 'cancelled') return null
  if (!iso) return { label: t('when.finding'), tone: 'neutral', soon: false }
  const n = daysUntil(iso, now)
  if (Number.isNaN(n)) return null
  const d0 = new Date(iso)
  if (n < 0) return { label: shortDate(d0, lang), tone: 'neutral', soon: false, past: true }
  if (n === 0) return { label: t('when.today'), tone: 'now', soon: true }
  if (n === 1) return { label: t('when.tomorrow'), tone: 'mine', soon: true }
  const d = new Date(iso)
  if (n < 7) {
    const long = new Intl.DateTimeFormat(locale(lang), { weekday: 'long', timeZone: MX_TZ }).format(d)
    return { label: long.replace(/^./, (c) => c.toUpperCase()), tone: 'info', soon: false }
  }
  return {
    label: new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', timeZone: MX_TZ }).format(d),
    tone: 'neutral',
    soon: false,
  }
}

