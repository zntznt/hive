import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { getPlateItems, plateCount } from '@/lib/plate'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { PlateItemRow } from '@/components/ui/PlateItemRow'
import { EmptyState } from '@/components/ui/EmptyState'
import { SettleUpFlow, ConfirmPaymentModal } from '@/components/settle-up'
import { MarkDoneButton } from './mark-done-modal'

export default async function PlatePage() {
  const { supabase, profile } = await requireProfile()
  const board = await getPlateItems(supabase, profile.id)
  const total = plateCount(board)

  const toUserIds = [...new Set(board.toPay.map((i) => i.toUserId))]
  const { data: methodRows } = toUserIds.length
    ? await supabase.from('payment_methods').select('user_id, kind, value').in('user_id', toUserIds).order('sort')
    : { data: [] as { user_id: string; kind: string; value: string }[] }
  const methodsFor = (uid: string) => (methodRows ?? []).filter((m) => m.user_id === uid)

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-1 flex items-baseline justify-between">
        <h1 className="font-display text-[23px] font-bold text-ink-900">En tu plato</h1>
        <Link href="/" className="text-[13px] text-ink-500">
          inicio
        </Link>
      </header>
      <p className="mb-5 text-[13px] text-ink-500">
        Todo lo pendiente antes de que cierre cada evento. Actúa aquí, o toca el nombre del evento para abrirlo.
      </p>

      {total === 0 ? (
        <EmptyState icon="jar" title="Todo en orden." hint="No tienes nada pendiente por ahora. A disfrutar el zumbido." />
      ) : (
        <>
          {board.toPay.length > 0 && (
            <section className="mb-6">
              <SectionHeader>Pagos · por hacer</SectionHeader>
              <div className="flex flex-col gap-2">
                {board.toPay.map((item, i) => (
                  <PlateItemRow
                    key={i}
                    icon="money-bill-transfer"
                    tone="danger"
                    title={`Le debes ${item.toName}`}
                    eventTitle={item.eventTitle}
                    eventHref={`/e/${item.eventSlug}`}
                    note={item.clubName ?? undefined}
                    action={
                      <SettleUpFlow
                        eventId={item.eventId}
                        slug={item.eventSlug}
                        fromUserId={profile.id}
                        toUserId={item.toUserId}
                        toName={item.toName}
                        amountCents={item.amountCents}
                        toPaymentMethods={methodsFor(item.toUserId)}
                      >
                        Pagar
                      </SettleUpFlow>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {board.toConfirm.length > 0 && (
            <section className="mb-6">
              <SectionHeader>Pagos · por confirmar</SectionHeader>
              <div className="flex flex-col gap-2">
                {board.toConfirm.map((item) => (
                  <PlateItemRow
                    key={item.settlementId}
                    icon="receipt"
                    tone="honey"
                    title={`${item.fromName} te pagó`}
                    eventTitle={item.eventTitle}
                    eventHref={`/e/${item.eventSlug}`}
                    note={item.clubName ?? undefined}
                    action={
                      <ConfirmPaymentModal
                        settlementId={item.settlementId}
                        slug={item.eventSlug}
                        fromName={item.fromName}
                        amountCents={item.amountCents}
                        method={item.method}
                        proofSignedUrl={item.proofSignedUrl}
                      >
                        Confirmar
                      </ConfirmPaymentModal>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {board.tasks.length > 0 && (
            <section className="mb-6">
              <SectionHeader>Tareas</SectionHeader>
              <div className="flex flex-col gap-2">
                {board.tasks.map((item) => (
                  <PlateItemRow
                    key={item.contributionId}
                    icon="circle-check"
                    tone="sage"
                    title={item.title}
                    eventTitle={item.eventTitle}
                    eventHref={`/e/${item.eventSlug}`}
                    note={item.clubName ?? undefined}
                    action={
                      <MarkDoneButton
                        contributionId={item.contributionId}
                        slug={item.eventSlug}
                        kind="task"
                        title={item.title}
                        eventTitle={item.eventTitle}
                      />
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {board.bringing.length > 0 && (
            <section className="mb-6">
              <SectionHeader>Traes</SectionHeader>
              <div className="flex flex-col gap-2">
                {board.bringing.map((item) => (
                  <PlateItemRow
                    key={item.contributionId}
                    icon="basket-shopping"
                    tone="honey"
                    title={item.qty ? `${item.title} · ${item.qty}` : item.title}
                    eventTitle={item.eventTitle}
                    eventHref={`/e/${item.eventSlug}`}
                    note={item.clubName ?? undefined}
                    action={
                      <MarkDoneButton
                        contributionId={item.contributionId}
                        slug={item.eventSlug}
                        kind="bring"
                        title={item.title}
                        eventTitle={item.eventTitle}
                      />
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
