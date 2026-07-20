import { fmtMoney } from '@/lib/money'

// Money is never themed: positive net = they're owed, negative = they owe.
export function BalanceRow({ name, netCents = 0 }: { name: string; netCents?: number }) {
  const pos = netCents >= 0
  return (
    <div className="flex items-center justify-between rounded-md border border-line-card bg-paper px-[13px] py-[9px] text-sm">
      <span className="text-ink-700">{name}</span>
      <span className={`font-bold tabular-nums ${pos ? 'text-success' : 'text-danger'}`}>
        {pos ? '+' : ''}
        {fmtMoney(netCents)}
      </span>
    </div>
  )
}
