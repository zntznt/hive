'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Select } from './ui/Input'
import { PAYMENT_METHOD_KEYS, PAYMENT_METHOD_VALUES } from '@/lib/payment-method-labels'
import { fmtMoney } from '@/lib/money'
import { dataUrlToBlob, uploadPaymentProof } from '@/lib/upload'
import { downscaleToDataUrl } from '@/lib/downscale'
import { recordSettlement, confirmSettlement, deleteSettlement } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/components/ui/LangProvider'

type PaymentMethodRow = { kind: string; value: string }

// The payer's 3-step settle-up wizard: how you paid -> proof screenshot
// (skipped for cash) -> review & submit. Shared by the event page's
// Expenses panel and /plate, wherever a suggested transfer is shown.
export function SettleUpFlow({
  eventId,
  slug,
  fromUserId,
  toUserId,
  toName,
  amountCents,
  toPaymentMethods,
  children,
  display = false,
}: {
  eventId: string
  slug: string
  fromUserId: string
  toUserId: string
  toName: string
  amountCents: number
  toPaymentMethods: PaymentMethodRow[]
  children: ReactNode
  // the loud slot wants a full-size button; a list row wants the small one
  display?: boolean
}) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3 | 'done'>(1)
  const [method, setMethod] = useState('bank_account')
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const isCash = method === 'cash'

  function close() {
    setOpen(false)
    setStep(1)
    setMethod('bank_account')
    setProofDataUrl(null)
    setError(null)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    try {
      // straight off the camera this is three to five megabytes and the bucket
      // stops at two, so shrink it here rather than let the upload fail after
      // the member has already picked their method
      setProofDataUrl(await downscaleToDataUrl(f))
    } catch (err) {
      setProofDataUrl(null)
      setError(err instanceof Error ? err.message : 'No pudimos leer esa imagen.')
    }
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        let proofPath: string | null = null
        if (proofDataUrl) {
          const blob = await dataUrlToBlob(proofDataUrl)
          // the storage path lands under the *uploader's* own uid (RLS);
          // the server action derives it from the session, which covers an
          // organizer recording someone else's payment on their behalf.
          proofPath = await uploadPaymentProof('', blob)
        }
        // the action refuses rather than throwing when the books have moved
        // under the modal, so a refusal must not land on the success step
        const res = await recordSettlement(eventId, slug, fromUserId, toUserId, amountCents, method, proofPath)
        if (res && !res.ok) {
          setError(res.error)
          return
        }
        setStep('done')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : tr('money.notRecorded'))
      }
    })
  }

  return (
    <>
      <Button size={display ? 'lg' : 'sm'} display={display} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <Modal
          open
          onClose={close}
          title={step === 'done' ? tr('plate.done!') : tr('money.markPaid')}
          subtitle={step === 'done' ? undefined : `Tú → ${toName} · ${fmtMoney(amountCents)}`}
          footer={
            step === 'done' ? (
              <Button onClick={close}>{tr('common.close')}</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={step === 1 ? close : () => setStep((s) => ((s as number) - 1) as 1 | 2)}>
                  {step === 1 ? tr('common.cancel') : tr('common.back2')}
                </Button>
                {step === 3 ? (
                  <Button disabled={pending} onClick={submit}>
                    {pending ? tr('common.saving') : tr('money.confirmPayment')}
                  </Button>
                ) : (
                  <Button onClick={() => setStep((s) => ((s as number) + 1) as 2 | 3)} disabled={step === 2 && !isCash && !proofDataUrl}>
                    Siguiente
                  </Button>
                )}
              </>
            )
          }
        >
          {step === 'done' && (
            <div className="py-2 text-center">
              <div className="mb-2 text-honey-500"><Icon name="jar" size={30} /></div>
              <div className="text-sm text-ink-700">
                {isCash
                  ? `${toName} confirma cuando lo tenga en mano.`
                  : `Enviado. ${toName} solo necesita confirmar tu comprobante.`}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-3.5">
              <Select label={tr('money.how')} value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHOD_VALUES.map((v) => ({ value: v, label: tr(PAYMENT_METHOD_KEYS[v]) }))} />
              <div className="rounded-md bg-cream-sunk px-3.5 py-3 text-[13px] text-ink-700">
                {toPaymentMethods.length === 0 ? (
                  <>{toName} no registró cómo le gusta que le paguen. Pregúntale directo.</>
                ) : (
                  <>
                    <div className="mb-1.5 font-semibold">Cómo le pagas a {toName}:</div>
                    <ul className="space-y-0.5">
                      {toPaymentMethods.map((m, i) => (
                        <li key={i}>
                          {(PAYMENT_METHOD_KEYS[m.kind] ? tr(PAYMENT_METHOD_KEYS[m.kind]) : m.kind)}: {m.value}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 2 &&
            (isCash ? (
              <div className="rounded-md bg-cream-sunk px-3.5 py-3 text-[13px] text-ink-700">
                Pago en efectivo, no hace falta comprobante. {toName} confirma cuando lo tenga en mano.
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{tr('money.receipt')}</label>
                <label className="block cursor-pointer overflow-hidden rounded-md border-[1.5px] border-dashed border-line-input bg-cream-sunk text-center">
                  {proofDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proofDataUrl} alt="comprobante" className="block max-h-[220px] w-full object-cover" />
                  ) : (
                    <span className="block px-3.5 py-6 text-[13px] text-ink-500"><Icon name="camera" size={13} /> {tr('money.receipt.upload')}</span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={onFile} />
                </label>
                <div className="mt-2 text-xs text-ink-300"><Icon name="lock" size={11} /> Solo {toName} puede ver esta foto, porque es quien la recibe.</div>
              </div>
            ))}

          {step === 3 && (
            <div className="flex flex-col gap-2 text-sm text-ink-700">
              <div className="flex justify-between">
                <span className="text-ink-500">{tr('money.to')}</span>
                <span className="font-semibold">{toName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Cantidad</span>
                <span className="font-semibold">{fmtMoney(amountCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">{tr('money.method')}</span>
                <span className="font-semibold">{tr(PAYMENT_METHOD_KEYS[method])}</span>
              </div>
            </div>
          )}

          {/* outside the step 3 block on purpose: picking the proof can fail
              on step 2, and an error that only renders on the last step is an
              error nobody reads */}
          {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
        </Modal>
      )}
    </>
  )
}

// The recipient's side: view the claimed payment (proof via a short-lived
// signed URL, since the bucket is private) and confirm or reject it.
export function ConfirmPaymentModal({
  settlementId,
  slug,
  fromName,
  amountCents,
  method,
  proofSignedUrl,
  children,
}: {
  settlementId: string
  slug: string
  fromName: string
  amountCents: number
  method: string | null
  proofSignedUrl: string | null
  children: ReactNode
}) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function act(fn: (id: string, slug: string) => Promise<void>) {
    startTransition(async () => {
      await fn(settlementId, slug)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={tr('money.receipt')}
          subtitle={`${fromName} → Tú · ${fmtMoney(amountCents)}${method ? ` · ${(PAYMENT_METHOD_KEYS[method] ? tr(PAYMENT_METHOD_KEYS[method]) : method)}` : ''}`}
          footer={
            <>
              <Button variant="danger" disabled={pending} onClick={() => act(deleteSettlement)}>
                Rechazar
              </Button>
              <Button disabled={pending} onClick={() => act(confirmSettlement)}>
                Confirmar recibido
              </Button>
            </>
          }
        >
          {proofSignedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proofSignedUrl} alt="comprobante" className="max-h-[220px] w-full rounded-md object-cover" />
          ) : (
            <div className="grid h-[190px] place-items-center rounded-md bg-cream-sunk text-[13px] text-ink-300">
              Pago en efectivo, sin comprobante.
            </div>
          )}
          <div className="mt-2.5 text-xs text-ink-300"><Icon name="lock" size={11} /> {tr('money.receipt.private')}</div>
        </Modal>
      )}
    </>
  )
}
