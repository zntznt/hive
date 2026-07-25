import { deleteSettlement } from '@/app/actions'
import { supabaseServer } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/money'
import { suggestTransfers, type NetPosition } from '@/lib/settle'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Card } from '@/components/ui/Card'
import { BalanceRow } from '@/components/ui/BalanceRow'
import { PAYMENT_METHOD_LABELS } from '@/lib/payment-method-labels'
import { SettleUpFlow, ConfirmPaymentModal } from '@/components/settle-up'
import { AddExpenseButton, EditExpenseButton } from './expense-modal'
import { PayStrip } from './pay-strip'
import type { PaymentMethod } from '@/app/account/payment-methods-form'

type Expense = { id: string; payer_user_id: string; amount_cents: number; note: string }
type Balance = { user_id: string; paid_cents: number; owed_cents: number; net_cents: number }
type Settlement = {
  id: string
  from_user: string
  to_user: string
  amount_cents: number
  confirmed: boolean
  method: string | null
  proof_path: string | null
}
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

export default async function Expenses({
  eventId,
  slug,
  myId,
  isOrganizer,
  nameOf,
  members,
  guests,
  expenses,
  balances,
  settlements,
}: Props) {
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0)
  const pending = settlements.filter((s) => !s.confirmed)
  // event_balances counts only confirmed settlements, so a freshly "marcado pagado"
  // transfer would otherwise be re-suggested. Net out pending ones here so a paid
  // debt drops off the list instead of inviting a duplicate transfer.
  const adj = new Map<string, number>()
  for (const s of pending) {
    adj.set(s.from_user, (adj.get(s.from_user) ?? 0) + s.amount_cents)
    adj.set(s.to_user, (adj.get(s.to_user) ?? 0) - s.amount_cents)
  }
  const nets: NetPosition[] = balances
    .map((b) => ({
      user_id: b.user_id,
      name: nameOf.get(b.user_id) ?? '·',
      net_cents: b.net_cents + (adj.get(b.user_id) ?? 0),
    }))
    .filter((n) => n.net_cents !== 0)
  const suggestions = suggestTransfers(nets)

  const supabase = await supabaseServer()
  const creditorIds = [...new Set(suggestions.map((t) => t.to.user_id))]
  const { data: methodRows } = creditorIds.length
    ? await supabase.from('payment_methods').select('user_id, kind, value').in('user_id', creditorIds).order('sort')
    : { data: [] as { user_id: string; kind: string; value: string }[] }
  const methodsFor = (uid: string) => (methodRows ?? []).filter((m) => m.user_id === uid)

  // your own payback methods, editable from the pay strip's "mis datos"
  const myDebts = suggestions.filter((t) => t.from.user_id === myId && methodsFor(t.to.user_id).length > 0)
  const { data: myMethodRows } = myDebts.length
    ? await supabase.from('payment_methods').select('id, kind, value, sort').eq('user_id', myId).order('sort')
    : { data: [] as PaymentMethod[] }

  // signed URLs for private payment-proof screenshots the current user is allowed to see
  const proofFor = new Map<string, string>()
  for (const s of pending) {
    if (s.proof_path && (s.to_user === myId || s.from_user === myId)) {
      const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(s.proof_path, 300)
      if (data?.signedUrl) proofFor.set(s.id, data.signedUrl)
    }
  }

  return (
    <section className="mb-8">
      <SectionHeader
        action={
          <span className="flex items-center gap-3">
            {total > 0 && <span className="text-[12.5px] normal-case tracking-normal text-ink-500">{fmtMoney(total)}</span>}
            <AddExpenseButton eventId={eventId} slug={slug} myId={myId} members={members.map((m) => ({ ...m, name: nameOf.get(m.user_id) ?? '·' }))} guests={guests} nameOf={nameOf} />
          </span>
        }
      >
        Gastos
      </SectionHeader>

      {expenses.length === 0 && <p className="mb-2 text-sm text-ink-500">Sin gastos todavía.</p>}
      <ul className="mb-3 flex flex-col gap-1.5">
        {expenses.map((e) => (
          <li key={e.id}>
            <Card pad="sm" className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-ink-900">
                {e.note} <span className="text-ink-300">· pagó {nameOf.get(e.payer_user_id) ?? '·'}</span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-2.5">
                <span className="font-bold text-ink-900">{fmtMoney(e.amount_cents)}</span>
                {(e.payer_user_id === myId || isOrganizer) && (
                  <EditExpenseButton id={e.id} slug={slug} note={e.note} amount={(e.amount_cents / 100).toFixed(2)} />
                )}
              </span>
            </Card>
          </li>
        ))}
      </ul>

      {nets.length > 0 && (
        <>
          <SectionHeader>Balances</SectionHeader>
          <ul className="mb-3 flex flex-col gap-1.5">
            {nets
              .sort((a, b) => b.net_cents - a.net_cents)
              .map((n) => (
                <li key={n.user_id}>
                  <BalanceRow name={n.name} netCents={n.net_cents} />
                </li>
              ))}
          </ul>
        </>
      )}

      {suggestions.length > 0 && (
        <>
          <SectionHeader>Liquidar</SectionHeader>
          <ul className="mb-3 flex flex-col gap-1.5">
            {suggestions.map((t, i) => (
              <li key={i}>
                <Card pad="sm" className="flex items-center justify-between text-sm">
                  <span className="text-ink-700">
                    {t.from.name} → {t.to.name} · <b>{fmtMoney(t.amount_cents)}</b>
                  </span>
                  {(t.from.user_id === myId || isOrganizer) && (
                    <SettleUpFlow
                      eventId={eventId}
                      slug={slug}
                      fromUserId={t.from.user_id}
                      toUserId={t.to.user_id}
                      toName={t.to.name}
                      amountCents={t.amount_cents}
                      toPaymentMethods={methodsFor(t.to.user_id)}
                    >
                      Pagar
                    </SettleUpFlow>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          {myDebts.map((t) => {
            const m = methodsFor(t.to.user_id)[0]
            return (
              <PayStrip
                key={t.to.user_id}
                toName={t.to.name}
                methodKind={m.kind}
                methodValue={m.value}
                myMethods={(myMethodRows ?? []) as PaymentMethod[]}
              />
            )
          })}
        </>
      )}

      {pending.length > 0 && (
        <>
          <SectionHeader>Pagos por confirmar</SectionHeader>
          <ul className="flex flex-col gap-1.5">
            {pending.map((s) => (
              <li key={s.id}>
                <Card pad="sm" className="flex items-center justify-between border-honey-200 bg-honey-50 text-sm">
                  <span className="text-ink-700">
                    {nameOf.get(s.from_user) ?? '·'} dice que pagó {fmtMoney(s.amount_cents)} a {nameOf.get(s.to_user) ?? '·'}
                    {s.method && <span className="text-ink-500"> · {PAYMENT_METHOD_LABELS[s.method] ?? s.method}</span>}
                  </span>
                  {s.to_user === myId ? (
                    <ConfirmPaymentModal
                      settlementId={s.id}
                      slug={slug}
                      fromName={nameOf.get(s.from_user) ?? '·'}
                      amountCents={s.amount_cents}
                      method={s.method}
                      proofSignedUrl={proofFor.get(s.id) ?? null}
                    >
                      Confirmar
                    </ConfirmPaymentModal>
                  ) : (
                    (s.from_user === myId || isOrganizer) && (
                      <form action={deleteSettlement.bind(null, s.id, slug)}>
                        <button className="text-xs font-bold text-ink-500">retirar</button>
                      </form>
                    )
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
