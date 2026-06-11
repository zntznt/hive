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
