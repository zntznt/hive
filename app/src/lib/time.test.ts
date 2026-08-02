// npm test  - no framework, just assert
//
// The whole point of this file is that every date in Hive is read in Mexico
// City, and that there is one subtraction doing it. Both halves used to be
// false: `timeAgo` and `ageInDays` each floored elapsed milliseconds in
// whatever zone the runtime happened to be in, which on Vercel is UTC, so a
// comment posted at 23:00 last night read "hoy" until 23:00 today while the
// pill beside it said yesterday.
//
// Neither could be tested either, because `timeAgo` called `Date.now()`
// inline. `now` is a parameter on all of them now, which is what lets these
// assertions name an instant instead of hoping the clock cooperates.
import assert from 'node:assert'
import { daysBetween, sameDayInMexico, mexicoDay, MX_OFFSET } from './time'
import { timeAgo } from './relative-time'
import { ageInDays, ageLabel } from './debt-age'
import { whenPill } from './when'

// Instants are written in UTC on purpose: these are the cases where the UTC
// calendar day and the Mexico City one disagree, which is the bug.
const utc = (s: string) => new Date(s)

// --- daysBetween -----------------------------------------------------------

// 20:00 on 1 ago in Mexico, read at 14:00 on 2 ago. Eighteen hours elapsed, so
// dividing by 86,400,000 says 0; UTC says 0 too, because both instants land on
// 2 ago in UTC. It was yesterday.
assert.equal(daysBetween(utc('2026-08-02T02:00:00Z'), utc('2026-08-02T20:00:00Z')), 1)

// the mirror: 17:00 and 19:00 on the same Mexico evening, either side of UTC
// midnight. UTC calls that a day; it is one evening.
assert.equal(daysBetween(utc('2026-08-02T23:00:00Z'), utc('2026-08-03T01:00:00Z')), 0)

// same instant is today, and the future is negative
assert.equal(daysBetween(utc('2026-08-02T20:00:00Z'), utc('2026-08-02T20:00:00Z')), 0)
assert.equal(daysBetween(utc('2026-08-04T18:00:00Z'), utc('2026-08-02T18:00:00Z')), -2)

// accepts the ISO strings the database hands back, not just Date objects
assert.equal(daysBetween('2026-07-28T18:00:00Z', utc('2026-08-02T18:00:00Z')), 5)

// an unparseable date is NaN rather than a RangeError out of Intl.format
assert.ok(Number.isNaN(daysBetween('not a date', utc('2026-08-02T18:00:00Z'))))

// and it agrees with sameDayInMexico, which is the other half of this pair
for (const iso of ['2026-08-02T02:00:00Z', '2026-08-02T23:00:00Z', '2026-08-03T05:59:00Z']) {
  const now = utc('2026-08-02T23:30:00Z')
  assert.equal(daysBetween(iso, now) === 0, sameDayInMexico(iso, now), iso)
}

// a bare YYYY-MM-DD is noon in Mexico, so formatting it can never land on the
// neighbouring day. duplicate-window used to build this at UTC noon instead.
assert.equal(mexicoDay('2026-08-02').toISOString(), new Date(`2026-08-02T12:00:00${MX_OFFSET}`).toISOString())
assert.equal(daysBetween(mexicoDay('2026-08-01'), mexicoDay('2026-08-02')), 1)

// --- the four surfaces that read it ----------------------------------------

const now = utc('2026-08-02T20:00:00Z') // 14:00 on 2 ago in Mexico City
const lastNight = '2026-08-02T05:00:00Z' // 23:00 on 1 ago in Mexico City

// the reported bug, in the words the roster prints
assert.equal(timeAgo(lastNight, 'es', now), 'ayer')
assert.equal(timeAgo(lastNight, 'en', now), 'yesterday')
assert.equal(timeAgo('2026-08-02T16:00:00Z', 'es', now), 'hoy')
assert.equal(timeAgo(null, 'es', now), 'nunca')
assert.equal(timeAgo('2026-07-26T20:00:00Z', 'es', now), 'hace 1 semana')

// /plate counts the same days, and says them with the same words. These were
// two vocabularies, `time.*` and `age.*`, byte-identical in both languages, so
// a translator could change one screen and not the other.
assert.equal(ageInDays(lastNight, now), 1)
assert.equal(ageLabel(ageInDays(lastNight, now), 'es'), timeAgo(lastNight, 'es', now))
assert.equal(ageLabel(ageInDays(lastNight, now), 'en'), timeAgo(lastNight, 'en', now))
assert.equal(ageLabel(0, 'es'), 'hoy')

// a debt is never negative days old, and one with no date has no age
assert.equal(ageInDays('2026-08-04T20:00:00Z', now), 0)
assert.equal(ageInDays(null, now), null)

// past 30 days ageLabel keeps counting where timeAgo rounds to months. That is
// the one difference between them and it is deliberate: on /plate the count is
// the argument for chasing the debt.
assert.equal(ageLabel(55, 'es'), 'hace 55 días')
assert.equal(timeAgo('2026-06-08T20:00:00Z', 'es', now), 'hace 1 mes')

// whenPill counts forward off the same function, so it can no longer disagree
// with the timestamp printed beside it
assert.equal(whenPill(lastNight, null, now, 'es')?.past, true)
assert.equal(whenPill('2026-08-02T16:00:00Z', null, now, 'es')?.label, 'Hoy')
// an event at 01:00 tomorrow in Mexico is tomorrow, not "in 11 hours, today"
assert.equal(whenPill('2026-08-03T07:00:00Z', null, now, 'es')?.label, 'Mañana')

console.log('time: all assertions passed')
