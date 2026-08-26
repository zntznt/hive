import { t as translate, tf as format, type Lang } from './lang'
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

import { MX_TZ, fmtSpan, hasHappened, sameDayInMexico } from './time'

export type CardEvent = {
  id: string
  slug: string
  title: string
  chosen_start: string | null
  chosen_end?: string | null
  location: string | null
  // The street, when the pin has been resolved to one. On the day this is what
  // the footer prints: the venue name is the thing the person already knows.
  area?: string | null
  status: string
}

export type ClubFooter =
  | { kind: 'today'; event: CardEvent; window: string }
  | { kind: 'next'; event: CardEvent }
  | { kind: 'quiet'; since: string | null }

// Which event is a club's next one. Dated events come first in date order;
// undated ones (still finding a time) trail them. The tie-break chain is
// spelled out because two events at the same minute otherwise reorder between
// renders, and a card that shuffles on refresh reads as a bug.
// What "still to come" means, for the function that picks the next one and
// for the screen that counts them.
//
// These were two expressions. `clubNext` took `scheduling | scheduled` while
// the club page counted `not done and not cancelled`, which also admits
// `draft`. Nothing writes a draft today, so the two happened to agree, and
// the day something did the header would have said 3 over a list of 2 while
// the Clubs tab named an event the count did not believe in. That is the
// drift this file exists to end, so it is one predicate.
//
// Status alone was still not enough, because nothing writes `done` unless an
// organizer closes the night by hand. A `scheduled` event two weeks past was
// upcoming forever. `hasHappened` is the clock, and it is the same one the
// Eventos tab and the event page read.
//
// It takes `now` rather than reading the clock so that a page renders one
// answer, which also means it must not be handed straight to `.filter`: the
// second argument there is the index.
export const isUpcoming = (
  e: { status: string; chosen_start: string | null; chosen_end?: string | null },
  now: Date = new Date()
) => (e.status === 'scheduling' || e.status === 'scheduled') && !hasHappened(e, now)

export function clubNext(events: CardEvent[], now: Date = new Date()): CardEvent | null {
  const live = events.filter((e) => isUpcoming(e, now))
  // No second clock here. This used to keep an event for twelve hours after it
  // started, which was this function's way of not going quiet mid-evening, and
  // it was both too generous (still "next" at 7am) and too mean (a night with
  // no end time vanished as it began). `isUpcoming` holds it until it ends.
  const dated = live
    .filter((e) => e.chosen_start)
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
export function clubFooter(
  events: CardEvent[],
  lastActivity: string | null,
  now: Date = new Date(),
  lang: Lang = 'es'
): ClubFooter {
  const next = clubNext(events, now)
  if (!next) return { kind: 'quiet', since: lastActivity }
  if (next.chosen_start && sameDayInMexico(next.chosen_start, now)) {
    // On the day the address is the answer, so the time shrinks to a window
    // beside the category rather than taking a pill of its own.
    return { kind: 'today', event: next, window: fmtSpan(next.chosen_start, next.chosen_end, lang) }
  }
  return { kind: 'next', event: next }
}

// "Tranquilo desde abril." A month is the right grain: a club that last met in
// April does not need to know it was the 12th, and the sentence stays short
// enough to sit on one line next to its action.
export function quietSince(iso: string | null, lang: Lang = 'es'): string {
  if (!iso) return translate(lang, 'club.noEventsYet')
  const month = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: MX_TZ }).format(new Date(iso))
  return format(lang, 'clubs.quietSince', { month })
}
