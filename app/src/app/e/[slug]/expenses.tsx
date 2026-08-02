import { deleteSettlement } from '@/app/actions'
import { supabaseServer } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/money'
import { suggestTransfers, netOfPending } from '@/lib/settle'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Card } from '@/components/ui/Card'
import { BalanceRow } from '@/components/ui/BalanceRow'
import { PAYMENT_METHOD_KEYS } from '@/lib/payment-method-labels'
import { SettleUpFlow, ConfirmPaymentModal } from '@/components/settle-up'
import { AddExpenseButton, EditExpenseButton } from './expense-modal'
import { PayStrip } from './pay-strip'
import type { PaymentMethod } from '@/app/account/payment-methods-form'
import { getT } from '@/lib/current-lang'

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
  const { t: tr, tf } = await getT()
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0)
  const pending = settlements.filter((s) => !s.confirmed)
  const nets = netOfPending(balances, settlements, (id) => nameOf.get(id) ?? '·')
  const suggestions = suggestTransfers(nets)
  // Money still out, and across how many people. Summed from the owing side
  // only: every peso owed is also a peso somebody is waiting on, so adding
  // both halves would report twice what is actually outstanding.
  const owing = nets.filter((n) => n.net_cents < 0).length
  const stillOut = nets.reduce((sum, n) => (n.net_cents < 0 ? sum - n.net_cents : sum), 0)

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
    <section className="mb-[26px]">
      <SectionHeader
        action={
          <span className="flex items-center gap-3">
            {total > 0 && <span className="text-[12.5px] normal-case tracking-normal text-ink-500">{fmtMoney(total)}</span>}
            <AddExpenseButton eventId={eventId} slug={slug} myId={myId} members={members.map((m) => ({ ...m, name: nameOf.get(m.user_id) ?? '·' }))} guests={guests} nameOf={nameOf} />
          </span>
        }
      >
        {tr('money.expenses')}
      </SectionHeader>

      {expenses.length === 0 && <p className="mb-2 text-sm text-ink-500">{tr('event.noExpenses')}</p>}
      <ul className="mb-3 flex flex-col gap-1.5">
        {expenses.map((e) => (
          <li key={e.id}>
            <Card pad="row" className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-ink-900">
                {e.note} <span className="text-ink-300">{tf('money.paidBy', { name: nameOf.get(e.payer_user_id) ?? '·' })}</span>
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
          {/* The header answers "how bad is it" so the list underneath does not
              have to be added up by eye. Only the owing side is summed: the
              positive nets are the same money seen from the other end, so
              totalling everything would double it. */}
          <SectionHeader
            action={
              stillOut > 0 ? (
                <span className="text-[12.5px] text-ink-300">
                  {owing === 1 ? tf('money.betweenOne', { amount: fmtMoney(stillOut) }) : tf('money.betweenMany', { amount: fmtMoney(stillOut), n: owing })}
                </span>
              ) : (
                <span className="text-[12.5px] text-ink-300">{tr('event.byHand')}</span>
              )
            }
          >
            {tr('money.balances')}
          </SectionHeader>
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
          <SectionHeader>{tr('event.settle')}</SectionHeader>
          <ul className="mb-3 flex flex-col gap-1.5">
            {suggestions.map((t, i) => (
              <li key={i}>
                <Card pad="row" className="flex items-center justify-between text-sm">
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
                      {tr('event.pay')}
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
          <SectionHeader>{tr('event.toConfirm')}</SectionHeader>
          <ul className="flex flex-col gap-1.5">
            {pending.map((s) => (
              <li key={s.id}>
                <Card pad="row" className="flex items-center justify-between border-honey-200 bg-honey-50 text-sm">
                  <span className="text-ink-700">
                    {tf('money.saysPaid', { from: nameOf.get(s.from_user) ?? '·', amount: fmtMoney(s.amount_cents), to: nameOf.get(s.to_user) ?? '·' })}
                    {s.method && <span className="text-ink-500"> · {(PAYMENT_METHOD_KEYS[s.method] ? tr(PAYMENT_METHOD_KEYS[s.method]) : s.method)}</span>}
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
                      {tr('common.confirm')}
                    </ConfirmPaymentModal>
                  ) : (
                    (s.from_user === myId || isOrganizer) && (
                      <form action={deleteSettlement.bind(null, s.id, slug)}>
                        <button className="tap text-xs font-bold text-ink-500">{tr('event.withdraw')}</button>
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
