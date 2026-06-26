import { addExpense, confirmSettlement, deleteSettlement, recordSettlement } from '@/app/actions'
import { fmtEur } from '@/lib/money'
import { suggestTransfers, type NetPosition } from '@/lib/settle'

type Expense = { id: string; payer_user_id: string; amount_cents: number; note: string }
type Balance = { user_id: string; paid_cents: number; owed_cents: number; net_cents: number }
type Settlement = { id: string; from_user: string; to_user: string; amount_cents: number; confirmed: boolean }
type Guest = { id: string; name: string; host_user_id: string; promoted_to_user_id: string | null }
type Member = { user_id: string; in: boolean }

type Props = {
  eventId: string
  slug: string
  myId: string
  isOrganizer: boolean
  nameOf: Map<string, string>
  members: Member[]
  guests: Guest[]
  expenses: Expense[]
  balances: Balance[]
  settlements: Settlement[]
}

export default function Expenses({
  eventId, slug, myId, isOrganizer, nameOf, members, guests, expenses, balances, settlements,
}: Props) {
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0)
  const pending = settlements.filter((s) => !s.confirmed)
  // event_balances counts only confirmed settlements, so a freshly "marcado pagado"
  // transfer would otherwise be re-suggested. Net out pending ones here so a paid
  // debt drops off the list instead of inviting a duplicate Bizum.
  const adj = new Map<string, number>()
  for (const s of pending) {
    adj.set(s.from_user, (adj.get(s.from_user) ?? 0) + s.amount_cents)
    adj.set(s.to_user, (adj.get(s.to_user) ?? 0) - s.amount_cents)
  }
  const nets: NetPosition[] = balances
    .map((b) => ({
      user_id: b.user_id,
      name: nameOf.get(b.user_id) ?? '—',
      net_cents: b.net_cents + (adj.get(b.user_id) ?? 0),
    }))
    .filter((n) => n.net_cents !== 0)
  const suggestions = suggestTransfers(nets)

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
        Gastos {total > 0 && <span className="text-stone-500">· {fmtEur(total)}</span>}
      </h2>

      {expenses.length === 0 && (
        <p className="mb-2 text-sm text-stone-500">Sin gastos todavía.</p>
      )}
      <ul className="mb-3 space-y-1">
        {expenses.map((e) => (
          <li key={e.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3 text-sm">
            <span className="text-stone-800">
              {e.note} <span className="text-stone-400">· pagó {nameOf.get(e.payer_user_id) ?? '—'}</span>
            </span>
            <span className="font-medium text-stone-800">{fmtEur(e.amount_cents)}</span>
          </li>
        ))}
      </ul>

      <details className="mb-4 rounded-xl border border-dashed border-stone-300 p-3">
        <summary className="cursor-pointer text-sm font-medium text-amber-700">
          Añadir gasto (lo pagaste tú)
        </summary>
        <form action={addExpense.bind(null, eventId, slug)} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              name="note" required placeholder="Pizzas"
              className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
            />
            <input
              name="amount" required placeholder="42,50" inputMode="decimal"
              className="w-28 rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
            />
          </div>
          <p className="text-xs text-stone-500">Entre quiénes se reparte:</p>
          <div className="grid grid-cols-2 gap-1 text-sm text-stone-700">
            {members.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2">
                <input type="checkbox" name="participant" value={`u:${m.user_id}`} defaultChecked={m.in || m.user_id === myId} />
                {nameOf.get(m.user_id) ?? '—'}
              </label>
            ))}
            {guests.filter((g) => !g.promoted_to_user_id).map((g) => (
              <label key={g.id} className="flex items-center gap-2">
                <input type="checkbox" name="participant" value={`g:${g.id}`} />
                {g.name} <span className="text-xs text-stone-400">(invitado de {nameOf.get(g.host_user_id) ?? '—'})</span>
              </label>
            ))}
          </div>
          <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white">
            Guardar gasto
          </button>
        </form>
      </details>

      {nets.length > 0 && (
        <>
          <h3 className="mb-1 text-sm font-medium uppercase tracking-wide text-stone-400">Balances</h3>
          <ul className="mb-3 space-y-1 text-sm">
            {nets
              .sort((a, b) => b.net_cents - a.net_cents)
              .map((n) => (
                <li key={n.user_id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                  <span className="text-stone-700">{n.name}</span>
                  <span className={n.net_cents >= 0 ? 'font-medium text-stone-800' : 'text-red-700'}>
                    {n.net_cents > 0 ? '+' : ''}{fmtEur(n.net_cents)}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}

      {suggestions.length > 0 && (
        <>
          <h3 className="mb-1 text-sm font-medium uppercase tracking-wide text-stone-400">Liquidar</h3>
          <ul className="mb-3 space-y-1 text-sm">
            {suggestions.map((t, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
                <span className="text-stone-700">
                  {t.from.name} → {t.to.name} · <b>{fmtEur(t.amount_cents)}</b>
                </span>
                {(t.from.user_id === myId || isOrganizer) && (
                  <form action={recordSettlement.bind(null, eventId, slug, t.from.user_id, t.to.user_id, t.amount_cents)}>
                    <button className="text-xs text-amber-700 underline">marcar pagado</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {pending.length > 0 && (
        <>
          <h3 className="mb-1 text-sm font-medium uppercase tracking-wide text-stone-400">
            Pagos por confirmar
          </h3>
          <ul className="space-y-1 text-sm">
            {pending.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="text-stone-700">
                  {nameOf.get(s.from_user) ?? '—'} dice que pagó {fmtEur(s.amount_cents)} a {nameOf.get(s.to_user) ?? '—'}
                </span>
                <span className="flex gap-3">
                  {(s.from_user === myId || isOrganizer) && (
                    <form action={deleteSettlement.bind(null, s.id, slug)}>
                      <button className="text-xs text-stone-500 underline">retirar</button>
                    </form>
                  )}
                  {(s.to_user === myId || isOrganizer) && (
                    <form action={confirmSettlement.bind(null, s.id, slug)}>
                      <button className="text-xs text-amber-700 underline">confirmar recibido</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
