'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { claimContribution, promoteNextWaitlisted } from '@/app/actions'

// Claiming is a commitment: there's no un-claim in the app, so the design's
// "the club is counting on you" confirmation guard is load-bearing here.
export function ClaimContributionButton({ id, slug, title, eventTitle }: { id: string; slug: string; title: string; eventTitle: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function confirm() {
    startTransition(async () => {
      await claimContribution(id, slug)
      setOpen(false)
      toast('Apuntado. El club cuenta contigo.')
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Me lo pido
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="¿Lo traes tú?"
          subtitle={`${title} · ${eventTitle}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Todavía no
              </Button>
              <Button disabled={pending} onClick={confirm}>
                Sí, yo lo traigo
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-md bg-warning-bg px-3.5 py-3">
            <span aria-hidden="true" className="mt-0.5">
              ⚠️
            </span>
            <p className="text-[13.5px] leading-relaxed text-ink-700">
              En cuanto te lo apuntes, el club cuenta contigo. Solo quien organiza puede reasignarlo después.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}

// The organizer's "open a spot": capacity goes up by one and the first in
// line gets seated and notified.
export function PromoteNextButton({ eventId, slug, nextName }: { eventId: string; slug: string; nextName: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await promoteNextWaitlisted(eventId, slug)
          toast(`${nextName} ya tiene lugar. Le avisamos por correo.`)
          router.refresh()
        })
      }
    >
      Abrir un lugar (sube al siguiente)
    </Button>
  )
}
