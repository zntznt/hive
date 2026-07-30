'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import PaymentMethodsForm, { type PaymentMethod } from '@/app/account/payment-methods-form'

// "mis datos" on the pay strip: edit your own payback methods without
// leaving the event. Same form the Account page uses.
export function MyPaymentDetailsButton({ methods }: { methods: PaymentMethod[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="tap text-[12.5px] font-bold text-ink-500">
        mis datos
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Datos de pago" subtitle="Cómo te pagan de vuelta">
          <PaymentMethodsForm methods={methods} />
        </Modal>
      )}
    </>
  )
}
