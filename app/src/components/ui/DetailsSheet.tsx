'use client'

import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { SummaryRow } from './Density'

// Rule 3: reference material leaves the page.
//
// Organizers, the calendar links, the timezone, the join policy, the event's
// own receipts: all of it is true, none of it is why anyone opened the screen,
// and on the old page each got a section header of its own and sat between two
// things people came for. It lives behind one row now.
//
// A sheet rather than a route because it is a look, not a destination: you
// check who the organizers are and you go back to deciding whether you are
// going. A route would put a back button in the way of that.
export function DetailsSheet({
  label = 'Detalles, organizadores, calendario',
  title = 'Detalles',
  children,
}: {
  label?: string
  title?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <SummaryRow icon="circle-info" label={label} arrow />
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={title}>
          <div className="flex flex-col gap-[18px]">{children}</div>
        </Modal>
      )}
    </>
  )
}
