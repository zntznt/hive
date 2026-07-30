'use client'

import { useToast } from '@/components/ui/Toast'
import { PAYMENT_METHOD_LABELS } from '@/lib/payment-method-labels'
import { MyPaymentDetailsButton } from './my-payment-details'
import type { PaymentMethod } from '@/app/account/payment-methods-form'

// The sunk "how to actually pay them" strip under the settle list: the
// recipient's first saved method with one-tap copy, plus a shortcut to edit
// your own payback details.
export function PayStrip({
  toName,
  methodKind,
  methodValue,
  myMethods,
}: {
  toName: string
  methodKind: string
  methodValue: string
  myMethods: PaymentMethod[]
}) {
  const toast = useToast()

  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-cream-sunk px-[13px] py-[11px] text-[12.5px]">
      <span className="min-w-0 truncate text-ink-500">
        Págale a {toName} · <b className="text-ink-700">{PAYMENT_METHOD_LABELS[methodKind] ?? methodKind}</b> {methodValue}
      </span>
      <span className="flex flex-shrink-0 items-center gap-3">
        <button
          onClick={() => {
            try {
              navigator.clipboard.writeText(methodValue)
            } catch {}
            toast('Datos de pago copiados')
          }}
          className="tap text-[12.5px] font-bold text-honey-700"
        >
          copiar
        </button>
        <MyPaymentDetailsButton methods={myMethods} />
      </span>
    </div>
  )
}
