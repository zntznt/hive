'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useT } from '@/components/ui/LangProvider'
import PaymentMethodsForm, { type PaymentMethod } from '@/app/account/payment-methods-form'

// "mis datos" on the pay strip: edit your own payback methods without
// leaving the event. Same form the Account page uses.
export function MyPaymentDetailsButton({ methods }: { methods: PaymentMethod[] }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="tap text-[12.5px] font-bold text-ink-500">
        {tr('event.myDetails')}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={tr('event.payDetails')} subtitle={tr('event.howPaid')}>
          <PaymentMethodsForm methods={methods} />
        </Modal>
      )}
    </>
  )
}
