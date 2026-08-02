import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { getPlateItems, plateCount, plateItemKey, getStandings } from '@/lib/plate'
import { fmtMoney } from '@/lib/money'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Page, PageHeader } from '@/components/ui/Page'
import { getT } from '@/lib/current-lang'
import { PlateItemRow } from '@/components/ui/PlateItemRow'
import { PlateRsvp } from './plate-rsvp'
import { EmptyState } from '@/components/ui/EmptyState'
import { SettleUpFlow, ConfirmPaymentModal } from '@/components/settle-up'
import { Loud } from '@/components/ui/Density'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { ageInDays, ageLabel, byAge, STALE_DAYS } from '@/lib/debt-age'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { MarkDoneButton } from './mark-done-modal'
import SnoozeButton from './snooze-button'

export default async function PlatePage() {
  const { t: tr, tf, lang } = await getT()
  const { supabase, profile } = await requireProfile()
  const t = tr
  const board = await getPlateItems(supabase, profile.id)
  const total = plateCount(board)

  const standings = await getStandings(supabase, profile.id)
  // Only the side that is not already actionable further up the page.
  const owedToMe = standings.filter((s) => s.netCents > 0)
  const toUserIds = [...new Set(board.toPay.map((i) => i.toUserId))]
  const { data: methodRows } = toUserIds.length
    ? await supabase.from('payment_methods').select('user_id, kind, value').in('user_id', toUserIds).order('sort')
    : { data: [] as { user_id: string; kind: string; value: string }[] }
  const methodsFor = (uid: string) => (methodRows ?? []).filter((m) => m.user_id === uid)

  // The loud debt carries a face, so the people owed are fetched rather than
  // named. You are not paying six pesos, you are paying Marta.
  const { data: payeeRows } = toUserIds.length
    ? await supabase
        .from('users')
        .select('id, display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url')
        .in('id', toUserIds)
    : { data: [] as AvatarUser[] }
  const payeeOf = new Map((payeeRows ?? []).map((u) => [(u as { id: string }).id, u as unknown as AvatarUser]))

  // Money sorts by age, not amount and not when the row landed, and a debt
  // past thirty days stops being a row in a list.
  const debts = [...board.toPay].sort(byAge)
  const stale = debts.filter((d) => (ageInDays(d.heldAt) ?? 0) >= STALE_DAYS)
  const loudDebt = stale[0] ?? null
  const restDebts = loudDebt ? debts.filter((d) => d !== loudDebt) : debts

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
  // An old debt outranks an unanswered RSVP: the RSVP is still in time, the
  // debt has been late for a month. Failing a stale debt, the nearest deadline
  // takes the slot, which is what this page did before money could claim it.
  const loudest = loudDebt ? null : (answers[0] ?? null)
  const restAnswers = loudDebt ? answers : answers.slice(1)

  return (
    <Page>
      <PageHeader
        title={t('home.plate')}
        lede={t('plate.lede')}
      />

      {total === 0 ? (
        <EmptyState icon="jar" title={t('plate.clear.title')} hint={t('plate.clear.hint')} />
      ) : (
        <>
          {/* A debt past thirty days, with the face of the person waiting on
              it. The amount is deliberately not the loudest thing here: it is
              often small, and the reason to pay it is that it is old and it is
              owed to somebody you will see again. */}
          {loudDebt && (
            <section className="mb-[26px] rounded-lg border-[1.5px] border-honey-500 bg-honey-50 p-4">
              <div className="flex items-center gap-3">
                <UserAvatar user={payeeOf.get(loudDebt.toUserId) ?? { display_name: loudDebt.toName }} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold leading-tight text-ink-900">
                    {tf('plate.put', { name: loudDebt.toName, amount: fmtMoney(loudDebt.amountCents) })}
                  </p>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-500">
                    {loudDebt.eventTitle}
                    {' · '}
                    <span className="font-bold text-danger">{ageLabel(ageInDays(loudDebt.heldAt), lang)}</span>
                  </p>
                </div>
              </div>
              <div className="mt-3.5 flex items-center gap-2.5">
                <SettleUpFlow
                  eventId={loudDebt.eventId}
                  slug={loudDebt.eventSlug}
                  fromUserId={profile.id}
                  toUserId={loudDebt.toUserId}
                  toName={loudDebt.toName}
                  amountCents={loudDebt.amountCents}
                  toPaymentMethods={methodsFor(loudDebt.toUserId)}
                  display
                >
                  {tf('plate.payTo', { name: loudDebt.toName })}
                </SettleUpFlow>
                <SnoozeButton itemKey={plateItemKey(loudDebt)} label={t('plate.later')} />
              </div>
            </section>
          )}

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
                    ? tr('event.markAvailability')
                    : loudest.asks === 'rsvp'
                      ? tr('plate.rsvp')
                      : (loudest.pollLabel ?? tr('plate.voteMissing'))
                }
                body={
                  <>
                    {loudest.clubName
                      ? tf('plate.withClub', { event: loudest.eventTitle, club: loudest.clubName })
                      : tf('plate.atEvent', { event: loudest.eventTitle })}{' '}
                    {loudest.asks === 'availability'
                      ? tr('plate.needsAll')
                      : loudest.asks === 'rsvp'
                        ? tr('plate.rsvpWhy')
                        : tr('plate.pollOpen')}
                  </>
                }
              >
                <div className="flex items-center gap-3">
                  {/* The RSVP answers here rather than sending you away for
                      three words and three buttons. The grid and the poll
                      genuinely live on the event, so those still travel. */}
                  {loudest.asks === 'rsvp' ? (
                    <span className="flex-1">
                      <PlateRsvp eventId={loudest.eventId} slug={loudest.eventSlug} mine={loudest.mine ?? null} />
                    </span>
                  ) : (
                    <Link href={`/e/${loudest.eventSlug}`} className="block flex-1">
                      <Button block display>
                        {tr(loudest.asks === 'availability' ? 'event.markAvailability' : 'plate.answer')}
                      </Button>
                    </Link>
                  )}
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
              <SectionHeader>{t('plate.waiting')} · {restAnswers.length}</SectionHeader>
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
                        ? tr('plate.markWhen')
                        : item.asks === 'rsvp'
                          ? tr('plate.rsvp')
                          : (item.pollLabel ?? tr('plate.voteMissing'))
                    }
                    eventTitle={item.eventTitle}
                    eventHref={`/e/${item.eventSlug}`}
                    note={item.clubName ?? undefined}
                    action={
                      // The RSVP answers here. The other two have somewhere
                      // they have to send you, so they keep the snooze.
                      item.asks === 'rsvp' ? (
                        <PlateRsvp eventId={item.eventId} slug={item.eventSlug} mine={item.mine ?? null} />
                      ) : (
                        <SnoozeButton itemKey={plateItemKey(item)} />
                      )
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {restDebts.length > 0 && (
            <section className={loudDebt || loudest || restAnswers.length ? 'mt-[26px]' : undefined}>
              {/* The order is the information, so the header says it. Without
                  that, "oldest first" looks like an arbitrary shuffle to
                  anyone who expected the biggest number on top. */}
              <SectionHeader action={restDebts.length > 1 ? <span className="text-[12.5px] text-ink-300">{t('plate.pay.oldest')}</span> : null}>
                {loudDebt ? tr('plate.alsoToPay') : tr('plate.toPay')}
              </SectionHeader>
              <div className="flex flex-col gap-2">
                {restDebts.map((item, i) => (
                  <PlateItemRow
                    key={i}
                    icon="money-bill-transfer"
                    tone="danger"
                    title={tf('plate.put', { name: item.toName, amount: fmtMoney(item.amountCents) })}
                    eventTitle={item.eventTitle}
                    eventHref={`/e/${item.eventSlug}`}
                    note={ageLabel(ageInDays(item.heldAt), lang) ?? item.clubName ?? undefined}
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
                        {tr('plate.payAction')}
                      </SettleUpFlow>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {board.tasks.length > 0 && (
            <section className="mt-[26px]">
              <SectionHeader>{t('plate.tasks')}</SectionHeader>
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
              <SectionHeader>{t('plate.bringing')}</SectionHeader>
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

      {/* Everything pointing the other way, in one place. A payment somebody
          has claimed comes first and is the only actionable thing here: it is
          waiting on you to look at the proof.

          What people owe you is read only on purpose, and only the positive
          side of the standings is shown. The negative side used to be printed
          here too, under a different sentence, three sections below the same
          debts rendered as buttons you can act on. One of those was reference
          material about the other. */}
      {(board.toConfirm.length > 0 || owedToMe.length > 0) && (
        <section className="mt-[26px]">
          <SectionHeader
            action={<span className="text-[12.5px] text-ink-300">{board.toConfirm.length + owedToMe.length}</span>}
          >
            {tr('plate.owedToYou')}
          </SectionHeader>
          <div className="flex flex-col gap-2">
            {board.toConfirm.map((item) => (
              <PlateItemRow
                key={item.settlementId}
                icon="receipt"
                tone="honey"
                title={tf('plate.paidYou', { name: item.fromName, amount: fmtMoney(item.amountCents) })}
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
                    Revisarlo
                  </ConfirmPaymentModal>
                }
              />
            ))}
          </div>
          {owedToMe.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-line-card bg-paper">
              {owedToMe.map((s) => (
                <Link
                  key={s.userId}
                  href={`/events?person=${s.userId}`}
                  className="flex min-h-12 items-center justify-between gap-2 border-t border-line-divider px-3.5 py-2.5 first:border-t-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink-900">
                      {tf('plate.owesYou', { name: s.name, amount: fmtMoney(s.netCents) })}
                    </span>
                    <span className="text-[12px] text-ink-300">
                      {tf(s.events === 1 ? 'plate.events1' : 'plate.eventsN', { n: s.events })}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={10} className="flex-shrink-0 text-ink-300" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </Page>
  )
}
