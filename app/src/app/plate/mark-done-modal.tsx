'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toggleContribution } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

// Design's PlateModals task/bring flow: confirm first, then a honey "listo"
// state. The event page can still undo a done mark, so the copy stays honest
// about what happens without claiming irreversibility.
export function MarkDoneButton({
  contributionId,
  slug,
  kind,
  title,
  eventTitle,
}: {
  contributionId: string
  slug: string
  kind: 'task' | 'bring'
  title: string
  eventTitle: string
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const isTask = kind === 'task'

  function confirm() {
    startTransition(async () => {
      await toggleContribution(contributionId, slug, true)
      setDone(true)
    })
  }

  function close() {
    setOpen(false)
    setDone(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="tap font-bold text-honey-700">
        Hecho
      </button>
    )
  }

  if (done) {
    return (
      <Modal open onClose={close} title="¡Listo!" subtitle={eventTitle} footer={<Button onClick={close}>Cerrar</Button>}>
        <div className="py-2 text-center">
          <div className="mb-2 text-3xl" aria-hidden="true">
            <Icon name="jar" size={15} />
          </div>
          <p className="text-sm text-ink-700">
            {isTask ? 'Tarea hecha. Una cosa menos en tu plato.' : 'Apuntado como llevado. No se te olvide en la puerta.'}
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={() => setOpen(false)}
      title={isTask ? '¿Marcar la tarea como hecha?' : '¿Marcar como llevado?'}
      subtitle={`${title} · ${eventTitle}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Todavía no
          </Button>
          <Button disabled={pending} onClick={confirm}>
            {isTask ? 'Sí, ya está' : 'Sí, yo lo llevo'}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-md bg-warning-bg px-3.5 py-3">
        <span aria-hidden="true" className="mt-0.5">
          <Icon name="triangle-exclamation" size={13} />
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink-700">
          {isTask
            ? 'Al marcarla hecha, desaparece de la lista de todos. Si te equivocas, se puede deshacer desde el evento.'
            : 'Al confirmarlo, el club lo da por cubierto. Si te equivocas, se puede deshacer desde el evento.'}
        </p>
      </div>
    </Modal>
  )
}
