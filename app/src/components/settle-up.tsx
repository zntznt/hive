'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Select } from './ui/Input'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/payment-method-labels'
import { fmtMoney } from '@/lib/money'
import { dataUrlToBlob, uploadPaymentProof } from '@/lib/upload'
import { recordSettlement, confirmSettlement, deleteSettlement } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

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
}: {
  eventId: string
  slug: string
  fromUserId: string
  toUserId: string
  toName: string
  amountCents: number
  toPaymentMethods: PaymentMethodRow[]
  children: ReactNode
}) {
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

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setProofDataUrl(reader.result as string)
    reader.readAsDataURL(f)
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
        await recordSettlement(eventId, slug, fromUserId, toUserId, amountCents, method, proofPath)
        setStep('done')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.')
      }
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
          onClose={close}
          title={step === 'done' ? '¡Listo!' : 'Marcar como pagado'}
          subtitle={step === 'done' ? undefined : `Tú → ${toName} · ${fmtMoney(amountCents)}`}
          footer={
            step === 'done' ? (
              <Button onClick={close}>Cerrar</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={step === 1 ? close : () => setStep((s) => ((s as number) - 1) as 1 | 2)}>
                  {step === 1 ? 'Cancelar' : 'Atrás'}
                </Button>
                {step === 3 ? (
                  <Button disabled={pending} onClick={submit}>
                    {pending ? 'Guardando…' : 'Confirmar pago'}
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
              <Select label="¿Cómo pagaste?" value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHOD_OPTIONS} />
              <div className="rounded-md bg-cream-sunk px-3.5 py-3 text-[13px] text-ink-700">
                {toPaymentMethods.length === 0 ? (
                  <>{toName} no registró cómo le gusta que le paguen. Pregúntale directo.</>
                ) : (
                  <>
                    <div className="mb-1.5 font-semibold">Cómo le pagas a {toName}:</div>
                    <ul className="space-y-0.5">
                      {toPaymentMethods.map((m, i) => (
                        <li key={i}>
                          {PAYMENT_METHOD_LABELS[m.kind] ?? m.kind}: {m.value}
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
                <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">Comprobante de pago</label>
                <label className="block cursor-pointer overflow-hidden rounded-md border-[1.5px] border-dashed border-line-input bg-cream-sunk text-center">
                  {proofDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proofDataUrl} alt="comprobante" className="block max-h-[220px] w-full object-cover" />
                  ) : (
                    <span className="block px-3.5 py-6 text-[13px] text-ink-500"><Icon name="camera" size={13} /> Toca para subir una captura de la transferencia</span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={onFile} />
                </label>
                <div className="mt-2 text-xs text-ink-300"><Icon name="lock" size={11} /> Solo {toName} puede ver esta foto, porque es quien la recibe.</div>
              </div>
            ))}

          {step === 3 && (
            <div className="flex flex-col gap-2 text-sm text-ink-700">
              <div className="flex justify-between">
                <span className="text-ink-500">Para</span>
                <span className="font-semibold">{toName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Cantidad</span>
                <span className="font-semibold">{fmtMoney(amountCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Método</span>
                <span className="font-semibold">{PAYMENT_METHOD_LABELS[method]}</span>
              </div>
              {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
            </div>
          )}
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
          title="Comprobante de pago"
          subtitle={`${fromName} → Tú · ${fmtMoney(amountCents)}${method ? ` · ${PAYMENT_METHOD_LABELS[method] ?? method}` : ''}`}
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
          <div className="mt-2.5 text-xs text-ink-300"><Icon name="lock" size={11} /> Solo tú puedes ver esto, porque eres quien lo recibió.</div>
        </Modal>
      )}
    </>
  )
}
