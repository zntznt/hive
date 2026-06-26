// node src/lib/settle.test.mjs  - no framework, just assert
import assert from 'node:assert'

// inline copy of suggestTransfers (settle.ts is TS; this keeps the check dependency-free)
function suggestTransfers(nets) {
  const debtors = nets.filter((n) => n.net_cents < 0).map((n) => ({ ...n, left: -n.net_cents })).sort((a, b) => b.left - a.left)
  const creditors = nets.filter((n) => n.net_cents > 0).map((n) => ({ ...n, left: n.net_cents })).sort((a, b) => b.left - a.left)
  const out = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].left, creditors[j].left)
    if (pay > 0) out.push({ from: debtors[i], to: creditors[j], amount_cents: pay })
    debtors[i].left -= pay; creditors[j].left -= pay
    if (debtors[i].left <= 0) i++
    if (creditors[j].left <= 0) j++
  }
  return out
}
const n = (id, c) => ({ user_id: id, name: id, net_cents: c })

// balanced set: every debtor's debt is fully covered, total moved = total owed
let t = suggestTransfers([n('a', 3000), n('b', -1000), n('c', -2000)])
assert.equal(t.reduce((s, x) => s + x.amount_cents, 0), 3000)
assert.ok(t.every((x) => x.from.net_cents < 0 && x.to.net_cents > 0))

// each debtor pays exactly their debt across the transfers
const paid = {}
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
assert.equal(t.reduce((s, x) => s + x.amount_cents, 0), 400)

console.log('settle: all assertions passed')
