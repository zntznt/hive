export type NetPosition = { user_id: string; name: string; net_cents: number }
export type Transfer = { from: NetPosition; to: NetPosition; amount_cents: number }

// greedy min-cashflow: repeatedly match the largest debtor with the largest creditor
export function suggestTransfers(nets: NetPosition[]): Transfer[] {
  const debtors = nets
    .filter((n) => n.net_cents < 0)
    .map((n) => ({ ...n, left: -n.net_cents }))
    .sort((a, b) => b.left - a.left)
  const creditors = nets
    .filter((n) => n.net_cents > 0)
    .map((n) => ({ ...n, left: n.net_cents }))
    .sort((a, b) => b.left - a.left)

  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].left, creditors[j].left)
    if (pay > 0) out.push({ from: debtors[i], to: creditors[j], amount_cents: pay })
    debtors[i].left -= pay
    creditors[j].left -= pay
    if (debtors[i].left <= 0) i++
    if (creditors[j].left <= 0) j++
  }
  return out
}

// event_balances counts only CONFIRMED settlements, so a payment somebody has
// marked as sent is still owed as far as the view is concerned. Every surface
// that suggests a transfer has to net those out first, or it re-suggests a
// debt the person already paid.
//
// This lived inline on the event page and again in getPlateItems, and a third
// caller (the per person roll-up) simply forgot, so /plate told you a debt was
// gone in one section and still owed in another. One function, so the three
// cannot drift apart again.
export type PendingSettlement = { from_user: string; to_user: string; amount_cents: number; confirmed?: boolean }

export function netOfPending(
  balances: { user_id: string; net_cents: number }[],
  settlements: PendingSettlement[],
  nameOf?: (id: string) => string
): NetPosition[] {
  const adj = new Map<string, number>()
  for (const s of settlements) {
    if (s.confirmed) continue
    adj.set(s.from_user, (adj.get(s.from_user) ?? 0) + s.amount_cents)
    adj.set(s.to_user, (adj.get(s.to_user) ?? 0) - s.amount_cents)
  }
  return balances
    .map((b) => ({
      user_id: b.user_id,
      name: nameOf?.(b.user_id) ?? '',
      net_cents: b.net_cents + (adj.get(b.user_id) ?? 0),
    }))
    .filter((n) => n.net_cents !== 0)
}
