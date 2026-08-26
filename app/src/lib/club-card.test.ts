// npm test  - no framework, just assert
//
// `isUpcoming` decided from status alone, and nothing writes `done` unless an
// organizer closes the night by hand. So a scheduled event two weeks past was
// upcoming forever: the club page counted it as "1 próximo" and Home listed it
// under "lo que viene" while the Eventos tab, the only screen that asked the
// clock, said "fuiste". These assertions are the clock being asked.
import assert from 'node:assert'
import { isUpcoming, clubNext, type CardEvent } from './club-card'

const now = new Date('2026-08-02T20:00:00Z') // 14:00 on 2 ago in Mexico City

const ev = (over: Partial<CardEvent> & { id: string }): CardEvent => ({
  slug: over.id,
  title: over.id,
  chosen_start: null,
  chosen_end: null,
  location: null,
  status: 'scheduled',
  ...over,
})

// --- isUpcoming ------------------------------------------------------------

const over = ev({ id: 'over', chosen_start: '2026-07-20T01:00:00Z', chosen_end: '2026-07-20T05:00:00Z' })
const soon = ev({ id: 'soon', chosen_start: '2026-08-05T01:00:00Z', chosen_end: '2026-08-05T05:00:00Z' })

// the bug, in one line: still `scheduled`, finished twelve days ago
assert.equal(over.status, 'scheduled')
assert.equal(isUpcoming(over, now), false)
assert.equal(isUpcoming(soon, now), true)

// running right now is upcoming until it ends, not until it starts
const tonight = ev({ id: 'tonight', chosen_start: '2026-08-02T19:00:00Z', chosen_end: '2026-08-03T02:00:00Z' })
assert.equal(isUpcoming(tonight, now), true)

// still finding a date has no instant to compare against, so it stays
assert.equal(isUpcoming(ev({ id: 'tbd', status: 'scheduling' }), now), true)

// closed and called off are still not upcoming, whatever the clock says
assert.equal(isUpcoming(ev({ id: 'closed', status: 'done', chosen_start: '2026-08-05T01:00:00Z' }), now), false)
assert.equal(isUpcoming(ev({ id: 'off', status: 'cancelled', chosen_start: '2026-08-05T01:00:00Z' }), now), false)

// it must never be handed straight to .filter: the second argument there is
// the index, which would be read as the clock
assert.deepEqual([over, soon].filter((e) => isUpcoming(e, now)).map((e) => e.id), ['soon'])

// --- clubNext --------------------------------------------------------------

// the club's next night is the soonest one that has not finished, and a night
// that is over is not it however recently it was
assert.equal(clubNext([over, soon], now)?.id, 'soon')
assert.equal(clubNext([tonight, soon], now)?.id, 'tonight')

// nothing left but finished nights means the card goes quiet, which is what
// puts "tranquilo desde julio" under it
assert.equal(clubNext([over], now), null)

// dated first, undated behind: an event still finding a time is only the next
// one when there is nothing pinned
assert.equal(clubNext([ev({ id: 'tbd', status: 'scheduling' }), soon], now)?.id, 'soon')
assert.equal(clubNext([ev({ id: 'tbd', status: 'scheduling' }), over], now)?.id, 'tbd')

// same minute twice resolves by title then id, so the card cannot shuffle
// between renders
const a = ev({ id: 'a1', title: 'Aaa', chosen_start: '2026-08-05T01:00:00Z' })
const b = ev({ id: 'b1', title: 'Bbb', chosen_start: '2026-08-05T01:00:00Z' })
assert.equal(clubNext([b, a], now)?.id, 'a1')

console.log('club-card: all assertions passed')
