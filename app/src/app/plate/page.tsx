import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { getPlateItems, plateCount, plateItemKey, getStandings } from '@/lib/plate'
import { fmtMoney } from '@/lib/money'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Page, PageHeader } from '@/components/ui/Page'
import { PlateItemRow } from '@/components/ui/PlateItemRow'
import { EmptyState } from '@/components/ui/EmptyState'
import { SettleUpFlow, ConfirmPaymentModal } from '@/components/settle-up'
import { Loud } from '@/components/ui/Density'
import { Button } from '@/components/ui/Button'
import { MarkDoneButton } from './mark-done-modal'
import SnoozeButton from './snooze-button'

export default async function PlatePage() {
  const { supabase, profile } = await requireProfile()
  const board = await getPlateItems(supabase, profile.id)
  const total = plateCount(board)

  const standings = await getStandings(supabase, profile.id)
  const toUserIds = [...new Set(board.toPay.map((i) => i.toUserId))]
  const { data: methodRows } = toUserIds.length
    ? await supabase.from('payment_methods').select('user_id, kind, value').in('user_id', toUserIds).order('sort')
    : { data: [] as { user_id: string; kind: string; value: string }[] }
  const methodsFor = (uid: string) => (methodRows ?? []).filter((m) => m.user_id === uid)

  // Rule 4: one auto-open thing, and it is deterministic. Nearest deadline
  // first, which is what the rule actually says. Sorting by kind alone meant a
  // grid for an event three weeks out beat an RSVP for tomorrow night, and
  // among equals the winner was whatever row Postgres happened to return
  // first. Kind only breaks a tie: nothing else on an event can happen until
  // its availability is in, and a poll with no vote still has a result.
  const RANK = { availability: 0, rsvp: 1, poll: 2 }
  const due = (v: string | null) => (v ? new Date(v).getTime() : Number.POSITIVE_INFINITY)
  const answers = [...board.toAnswer].sort(
    (a, b) => due(a.dueAt) - due(b.dueAt) || RANK[a.asks] - RANK[b.asks] || a.eventId.localeCompare(b.eventId)
  )
  const loudest = answers[0] ?? null
  const restAnswers = answers.slice(1)

  return (
    <Page>
      <PageHeader
        title="En tu plato"
        lede="Todo lo pendiente antes de que cierre cada evento. Actúa aquí, o toca el nombre del evento para abrirlo."
        action={
          <Link href="/" className="tap inline-flex items-center text-[13px] text-ink-500">
            inicio
          </Link>
        }
      />

      {total === 0 ? (
        <EmptyState icon="jar" title="Todo en orden." hint="No tienes nada pendiente por ahora. A disfrutar el zumbido." />
      ) : (
        <>
          {/* Rule 1, applied to the page that had no loud block at all. Seven
              equal rows meant seven equal claims on you, so the nearest
              deadline is answerable where you land, which is this page's whole
              job. It is not extra height: that item was the first row a moment
              ago, and the rest of the list is unchanged. */}
          {loudest && (
            <div className="mb-[26px]">
              <Loud
                title={
                  loudest.asks === 'availability'
                    ? 'Falta que marques cuándo puedes'
                    : loudest.asks === 'rsvp'
                      ? '¿Vas a ir?'
                      : (loudest.pollLabel ?? 'Falta tu voto')
                }
                body={
                  <>
                    {loudest.eventTitle}
                    {loudest.clubName ? `, con ${loudest.clubName}` : ''}.{' '}
                    {loudest.asks === 'availability'
                      ? 'Nadie puede fijar la fecha hasta que respondan todos.'
                      : loudest.asks === 'rsvp'
                        ? 'Saber quién va decide el lugar y lo que hay que llevar.'
                        : 'La encuesta sigue abierta.'}
                  </>
                }
              >
                <div className="flex items-center gap-3">
                  <Link href={`/e/${loudest.eventSlug}`} className="block flex-1">
                    <Button block display>
                      {loudest.asks === 'availability' ? 'Marcar mi disponibilidad' : 'Responder'}
                    </Button>
                  </Link>
                  {/* the loud slot is the one item you are most likely to be
                      unable to answer right now, so it keeps the way to put it
                      down. Without this a grid you never intend to paint pins
                      the top of this page permanently. */}
                  <SnoozeButton itemKey={plateItemKey(loudest)} />
                </div>
              </Loud>
            </div>
          )}

          {/* The rest of what people are waiting on, minus whatever the loud
              block took. They navigate and never open a modal: a generic plate
              confirmation would offer "yes, I brought it" to a row that is
              asking whether you are coming. */}
          {restAnswers.length > 0 && (
            <section>
              <SectionHeader>Te están esperando · {restAnswers.length}</SectionHeader>
              <div className="flex flex-col gap-2">
                {restAnswers.map((item, i) => (
                  <PlateItemRow
                    key={`answer-${i}`}
                    icon={
                      item.asks === 'availability'
                        ? 'calendar-plus'
                        : item.asks === 'rsvp'
                          ? 'circle-info'
                          : 'square-poll-vertical'
                    }
                    tone="honey"
                    title={
                      item.asks === 'availability'
                        ? 'Marca cuándo puedes'
                        : item.asks === 'rsvp'
                          ? '¿Vas a ir?'
                          : (item.pollLabel ?? 'Falta tu voto')
                    }
                    eventTitle={item.eventTitle}
                    eventHref={`/e/${item.eventSlug}`}
                    note={item.clubName ?? undefined}
                    action={<SnoozeButton itemKey={plateItemKey(item)} />}
                  />
                ))}
              </div>
            </section>
          )}

          {board.toPay.length > 0 && (
            <section className={loudest || restAnswers.length ? 'mt-[26px]' : undefined}>
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
            <section className="mt-[18px]">
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
            <section className="mt-[26px]">
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
            <section className="mt-[18px]">
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

      {/* Where you stand with each person, netted across every event. Read
          only on purpose: paying, proof and confirmation stay on the event,
          because one netted transfer cannot be accepted or rejected per
          event. */}
      {standings.length > 0 && (
        <section className="mt-[26px]">
          <SectionHeader>Cómo van las cuentas · por persona</SectionHeader>
          <div className="overflow-hidden rounded-lg border border-line-card bg-paper">
            {standings.map((s) => (
              <div
                key={s.userId}
                className="flex items-center justify-between gap-2 border-t border-line-divider px-3.5 py-2.5 first:border-t-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink-900">{s.name}</span>
                  <Link href={`/events?person=${s.userId}`} className="text-[12px] font-semibold text-honey-700">
                    {s.events} {s.events === 1 ? 'evento' : 'eventos'}
                  </Link>
                </span>
                <span
                  className={`flex-shrink-0 text-sm font-extrabold ${
                    s.netCents < 0 ? 'text-danger' : 'text-success'
                  }`}
                >
                  {s.netCents < 0 ? `le debes ${fmtMoney(-s.netCents)}` : `te debe ${fmtMoney(s.netCents)}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Page>
  )
}
