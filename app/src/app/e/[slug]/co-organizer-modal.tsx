'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { addCoOrganizer } from '@/app/actions'

type Candidate = { user_id: string; user: AvatarUser }

export function CoOrganizerButton({ eventId, slug, candidates }: { eventId: string; slug: string; candidates: Candidate[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function invite(userId: string, name: string) {
    startTransition(async () => {
      await addCoOrganizer(eventId, slug, userId)
      setOpen(false)
      toast(`${name} ya puede co-organizar. Le avisamos por correo.`)
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[12.5px] font-bold text-honey-700">
        ＋ Co-organizador
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Añadir co-organizador" subtitle="Puede editar el evento y gestionar quién va">
          <div className="flex flex-col gap-2">
            {candidates.length === 0 && <p className="text-sm text-ink-500">No hay más miembros del club para invitar.</p>}
            {candidates.map((c) => (
              <button
                key={c.user_id}
                disabled={pending}
                onClick={() => invite(c.user_id, c.user.display_name)}
                className="flex items-center gap-2.5 rounded-md border border-line-card bg-paper p-2.5 text-left text-sm font-bold text-ink-900 disabled:opacity-60"
              >
                <UserAvatar user={c.user} size={28} />
                {c.user.display_name}
                <span className="ml-auto text-[12.5px] font-bold text-honey-700">Invitar →</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-300">Solo organizadores y admins del club pueden co-organizar. La invitación se avisa por correo y WhatsApp.</p>
        </Modal>
      )}
    </>
  )
}
