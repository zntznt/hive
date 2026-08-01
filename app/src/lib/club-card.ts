// What a club card says about itself.
//
// Two screens draw a club: the Clubs tab and Home's "tus clubs". They used to
// each decide what the footer said, and drifted: one counted upcoming events,
// the other named the next one, and neither noticed a club whose event was
// tonight. One function decides now, and both read it.
//
// The shape of the answer is the point. A club with something on tonight is a
// different card from a club with something next week, which is a different
// card again from a club that has gone quiet, and the footer is where that
// difference shows: an address, a name, or an honest sentence about nothing.

const TZ = 'America/Mexico_City'
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export type CardEvent = {
  id: string
  slug: string
  title: string
  chosen_start: string | null
  chosen_end?: string | null
  location: string | null
  status: string
}

export type ClubFooter =
  | { kind: 'today'; event: CardEvent; window: string }
  | { kind: 'next'; event: CardEvent }
  | { kind: 'quiet'; since: string | null }

function sameDayInMexico(iso: string, now: Date) {
  return DAY.format(new Date(iso)) === DAY.format(now)
}

const HHMM = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })

// Which event is a club's next one. Dated events come first in date order;
// undated ones (still finding a time) trail them. The tie-break chain is
// spelled out because two events at the same minute otherwise reorder between
// renders, and a card that shuffles on refresh reads as a bug.
export function clubNext(events: CardEvent[], now: Date = new Date()): CardEvent | null {
  const live = events.filter((e) => e.status === 'scheduling' || e.status === 'scheduled')
  const dated = live
    .filter((e) => e.chosen_start && new Date(e.chosen_start).getTime() >= now.getTime() - 12 * 3600_000)
    .sort(
      (a, b) =>
        Date.parse(a.chosen_start!) - Date.parse(b.chosen_start!) ||
        a.title.localeCompare(b.title, 'es') ||
        a.id.localeCompare(b.id)
    )
  if (dated.length) return dated[0]
  const undated = live
    .filter((e) => !e.chosen_start)
    .sort((a, b) => a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id))
  return undated[0] ?? null
}

// The footer, and with it the whole card's weight.
export function clubFooter(events: CardEvent[], lastActivity: string | null, now: Date = new Date()): ClubFooter {
  const next = clubNext(events, now)
  if (!next) return { kind: 'quiet', since: lastActivity }
  if (next.chosen_start && sameDayInMexico(next.chosen_start, now)) {
    // On the day the address is the answer, so the time shrinks to a window
    // beside the category rather than taking a pill of its own.
    const start = HHMM.format(new Date(next.chosen_start))
    const end = next.chosen_end ? HHMM.format(new Date(next.chosen_end)) : null
    return { kind: 'today', event: next, window: end ? `${start} a ${end}` : `desde las ${start}` }
  }
  return { kind: 'next', event: next }
}

// "Tranquilo desde abril." A month is the right grain: a club that last met in
// April does not need to know it was the 12th, and the sentence stays short
// enough to sit on one line next to its action.
export function quietSince(iso: string | null): string {
  if (!iso) return 'Todavía sin eventos.'
  const month = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: TZ }).format(new Date(iso))
  return `Tranquilo desde ${month}.`
}
