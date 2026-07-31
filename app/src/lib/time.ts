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

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...opts, timeZone: MX_TZ })

const DATE_TIME = fmt({ weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const DAY_MONTH = fmt({ day: 'numeric', month: 'short' })
const TIME = fmt({ hour: 'numeric', minute: '2-digit' })
const WEEKDAY_DAY = fmt({ weekday: 'short', day: 'numeric' })
const MONTH_YEAR = fmt({ month: 'short', year: 'numeric' })

const at = (iso: string | Date) => (iso instanceof Date ? iso : new Date(iso))

export const fmtDateTime = (iso: string | Date) => DATE_TIME.format(at(iso))
export const fmtDayMonth = (iso: string | Date) => DAY_MONTH.format(at(iso))
export const fmtTime = (iso: string | Date) => TIME.format(at(iso))
export const fmtWeekdayDay = (iso: string | Date) => WEEKDAY_DAY.format(at(iso))
export const fmtMonthYear = (iso: string | Date) => MONTH_YEAR.format(at(iso))

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
