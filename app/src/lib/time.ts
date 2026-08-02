import { t, tf, type Lang } from './lang'
// One clock for the whole app.
//
// Hive runs in Mexico and every screen says so, but half the date formatting
// passed no timeZone at all. That resolves to the runtime's zone, which is UTC
// on Vercel, and the pages that show an event's time are server components, so
// they only ever rendered in UTC. An event pinned for 8pm Wednesday displayed
// on its own page as "jueves, 6 ago, 02:00": wrong hour, wrong day, wrong
// weekday. The club page's date was a day out for anything after 6pm.
//
// Mexico has not observed DST since 2022, so the offset is a constant and a
// naive local time can be pinned to an instant by appending it.

export const MX_TZ = 'America/Mexico_City'
export const MX_OFFSET = '-06:00'

// The zone is Mexico whatever the language: an event at 8pm is at 8pm in
// Mexico City for a reader in London too, and shifting it to their clock would
// be telling them the wrong hour to turn up. Only the WORDS follow the
// language, which is why the locale is a parameter and the timeZone is not.
//
// Defaulting to Spanish keeps every existing caller correct: this is the app's
// own language, not a fallback for a missing translation.
const fmt = (opts: Intl.DateTimeFormatOptions, lang: Lang = 'es') =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-MX', { ...opts, timeZone: MX_TZ })

const at = (iso: string | Date) => (iso instanceof Date ? iso : new Date(iso))

export const fmtDateTime = (iso: string | Date, lang: Lang = 'es') =>
  fmt({ weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }, lang).format(at(iso))
export const fmtDayMonth = (iso: string | Date, lang: Lang = 'es') =>
  fmt({ day: 'numeric', month: 'short' }, lang).format(at(iso))
export const fmtTime = (iso: string | Date, lang: Lang = 'es') =>
  fmt({ hour: 'numeric', minute: '2-digit' }, lang).format(at(iso))
export const fmtWeekdayDay = (iso: string | Date, lang: Lang = 'es') =>
  fmt({ weekday: 'short', day: 'numeric' }, lang).format(at(iso))
export const fmtMonthYear = (iso: string | Date, lang: Lang = 'es') =>
  fmt({ month: 'short', year: 'numeric' }, lang).format(at(iso))

// Every time this app shows is a span, never a start.
//
// "20:00" answers when to turn up and nothing else. People need to know
// whether they are free afterwards, whether the trip across town is worth it,
// and when to arrange a ride home, and all three of those live in the end.
// Only a row too narrow to fit a range may fall back to the start, and it says
// "desde" so it reads as an open end rather than a whole evening.
//
// The Clubs tab already did this correctly while the event page for the very
// same event said "Desde las 20:00", which is the drift this replaces.
export function fmtSpan(startIso: string | Date | null, endIso?: string | Date | null, lang: Lang = 'es'): string {
  if (!startIso) return ''
  const start = fmtTime(startIso, lang)
  return endIso ? tf(lang, 'time.range', { a: start, b: fmtTime(endIso, lang) }) : tf(lang, 'time.from', { start })
}

// Whether an event falls on today, in Mexico City, where the club is.
//
// This used to be decided by string-matching WhenPill's label against 'Hoy'.
// WhenPill returns display copy: renaming it, uppercasing it or translating it
// would silently switch off the entire day-of layout with no error anywhere.
// Nothing branches on copy.
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: MX_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
export function sameDayInMexico(iso: string | Date, now: Date = new Date()): boolean {
  return DAY_KEY.format(at(iso)) === DAY_KEY.format(now)
}

// The event-shaped version, so callers do not each decide what a missing date
// or a cancelled event means.
export function isEventDay(
  event: { chosen_start: string | null; status: string },
  now: Date = new Date()
): boolean {
  if (!event.chosen_start) return false
  if (event.status === 'cancelled' || event.status === 'scheduling') return false
  return sameDayInMexico(event.chosen_start, now)
}

// A calendar day plus minutes-since-midnight, as the instant that means in
// Mexico City. The availability grid used to build this with `new Date("...T20:00:00")`,
// which the language defines as local time: an organizer whose phone was not on
// Mexico City time pinned a different hour than the one the grid was labelled
// with, and everyone else then saw that other hour.
export function mexicoInstant(day: string, minutesFromMidnight: number): Date {
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(`${day}T${pad(h)}:${pad(m)}:00${MX_OFFSET}`)
}

// A bare YYYY-MM-DD as noon in Mexico City. Noon rather than midnight so that
// formatting it can never land on the neighbouring day.
export const mexicoDay = (day: string) => new Date(`${day}T12:00:00${MX_OFFSET}`)

// The window an event is being scheduled inside: "31 jul a 3 ago · noches".
//
// While a date is being found this is the answer to "when", and the only place
// it appeared was as column headers on the availability grid. The card above
// said "Buscando fecha" and stopped, so anyone deciding whether to bother
// painting had to scroll to find out which week it was even about.
//
// The part of day is named rather than printed as hours, because "19:00 a
// 23:00" repeated on every one of four days is the same fact four times, and
// the grid is where the hours are actually chosen.
export function fmtWindow(
  startDay: string | null,
  endDay: string | null,
  timeMin?: number,
  timeMax?: number,
  lang: Lang = 'es'
): string | null {
  if (!startDay) return null
  const days =
    endDay && endDay !== startDay
      ? tf(lang, 'time.range', {
          a: fmtDayMonth(mexicoDay(startDay), lang),
          b: fmtDayMonth(mexicoDay(endDay), lang),
        })
      : fmtDayMonth(mexicoDay(startDay), lang)
  if (timeMin == null || timeMax == null) return days
  // Named by where the window sits, not by its length: a window that starts at
  // 19:00 is an evening whether it runs three hours or six.
  const part =
    timeMin >= 17 * 60
      ? t(lang, 'time.evenings')
      : timeMax <= 13 * 60
        ? t(lang, 'time.mornings')
        : timeMin >= 12 * 60
          ? t(lang, 'time.afternoons')
          : t(lang, 'time.allDay')
  return `${days} · ${part}`
}
