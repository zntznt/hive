// npm test  - no framework, just assert
//
// This file used to hold an inline copy of `suggestTransfers`, on the reasoning
// that settle.ts is TypeScript and a copy kept the check dependency-free. The
// copy was faithful and that was the problem: settle.ts could change in any
// direction and every assertion here still passed, which is the exact failure
// AGENTS.md opens with, committed by the one file whose job is to catch it.
// Node 22 runs TypeScript directly (`--experimental-strip-types`), so the
// reason is gone and the real module is imported.
import assert from 'node:assert'
import { suggestTransfers, netOfPending, type NetPosition, type PendingSettlement } from './settle'

const n = (id: string, c: number): NetPosition => ({ user_id: id, name: id, net_cents: c })

// --- suggestTransfers ------------------------------------------------------

// balanced set: every debtor's debt is fully covered, total moved = total owed
let t = suggestTransfers([n('a', 3000), n('b', -1000), n('c', -2000)])
assert.equal(
  t.reduce((s, x) => s + x.amount_cents, 0),
  3000
)
assert.ok(t.every((x) => x.from.net_cents < 0 && x.to.net_cents > 0))

// each debtor pays exactly their debt across the transfers
const paid: Record<string, number> = {}
for (const x of t) paid[x.from.user_id] = (paid[x.from.user_id] ?? 0) + x.amount_cents
assert.equal(paid.b, 1000)
assert.equal(paid.c, 2000)

// degenerate inputs terminate and produce nothing
assert.deepEqual(suggestTransfers([]), [])
assert.deepEqual(suggestTransfers([n('a', 0), n('b', 0)]), [])
assert.deepEqual(suggestTransfers([n('a', 500)]), []) // creditor with no debtor

// many small debtors, one big creditor - terminates, count bounded
t = suggestTransfers([n('big', 400), n('w', -100), n('x', -100), n('y', -100), n('z', -100)])
assert.equal(t.length, 4)
assert.equal(
  t.reduce((s, x) => s + x.amount_cents, 0),
  400
)

// --- netOfPending ----------------------------------------------------------
//
// The function whose own comment records that it drifted across three call
// sites and cost /plate a debt that read as gone in one section and owed in
// another. It had no test at all, while the trivial one above had five.

const balances = [
  { user_id: 'a', net_cents: 3000 },
  { user_id: 'b', net_cents: -1000 },
  { user_id: 'c', net_cents: -2000 },
]
const pending: PendingSettlement[] = [{ from_user: 'b', to_user: 'a', amount_cents: 1000 }]

// a payment b has marked as sent moves b to zero and drops them from the board
let nets = netOfPending(balances, pending)
assert.deepEqual(
  nets.map((x) => [x.user_id, x.net_cents]),
  [
    ['a', 2000],
    ['c', -2000],
  ]
)

// and the whole point: the next suggestion does not ask b to pay again
const after = suggestTransfers(nets)
assert.equal(after.length, 1)
assert.equal(after[0].from.user_id, 'c')
assert.equal(after[0].to.user_id, 'a')
assert.equal(after[0].amount_cents, 2000)

// a CONFIRMED settlement is already in event_balances, so netting it again
// would double-count it and hand b money they never received
nets = netOfPending(balances, [{ ...pending[0], confirmed: true }])
assert.deepEqual(
  nets.map((x) => [x.user_id, x.net_cents]),
  [
    ['a', 3000],
    ['b', -1000],
    ['c', -2000],
  ]
)

// a partial payment leaves the remainder owed, not the whole debt
nets = netOfPending(balances, [{ from_user: 'c', to_user: 'a', amount_cents: 750 }])
assert.equal(nets.find((x) => x.user_id === 'c')?.net_cents, -1250)
assert.equal(nets.find((x) => x.user_id === 'a')?.net_cents, 2250)

// several pending payments against one person accumulate
nets = netOfPending(balances, [
  { from_user: 'b', to_user: 'a', amount_cents: 400 },
  { from_user: 'c', to_user: 'a', amount_cents: 600 },
])
assert.equal(nets.find((x) => x.user_id === 'a')?.net_cents, 2000)

// no settlements at all is the balances, minus anyone already square
assert.deepEqual(
  netOfPending([...balances, { user_id: 'd', net_cents: 0 }], []).map((x) => x.user_id),
  ['a', 'b', 'c']
)

// names come from the caller's lookup, and are empty rather than undefined
// when there is none: the row renders either way, and "undefined" would ship
assert.equal(netOfPending(balances, [], (id) => id.toUpperCase())[0].name, 'A')
assert.equal(netOfPending(balances, [])[0].name, '')

console.log('settle: all assertions passed')
