'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { useT, useTf } from '@/components/ui/LangProvider'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { addCoOrganizer } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

type Candidate = { user_id: string; user: AvatarUser }

export function CoOrganizerButton({ eventId, slug, candidates }: { eventId: string; slug: string; candidates: Candidate[] }) {
  const tr = useT()
  const tf = useTf()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function invite(userId: string, name: string) {
    startTransition(async () => {
      await addCoOrganizer(eventId, slug, userId)
      setOpen(false)
      toast(tf('event.coorgAdded', { name }))
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="tap text-[12.5px] font-bold text-honey-700">
        <Icon name="plus" size={10} /> {tr('event.coorganizer')}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={tr('event.coorg.add')} subtitle={tr('event.coorg.can')}>
          <div className="flex flex-col gap-2">
            {candidates.length === 0 && <p className="text-sm text-ink-500">{tr('event.coorg.none')}</p>}
            {candidates.map((c) => (
              <button
                key={c.user_id}
                disabled={pending}
                onClick={() => invite(c.user_id, c.user.display_name)}
                className="min-h-11 flex items-center gap-2.5 rounded-md border border-line-card bg-paper p-2.5 text-left text-sm font-bold text-ink-900 disabled:opacity-60"
              >
                <UserAvatar user={c.user} size={28} />
                {c.user.display_name}
                <span className="inline-flex items-center gap-1 ml-auto text-[12.5px] font-bold text-honey-700">{tr('event.invite')} <Icon name="chevron-right" size={10} /></span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-300">{tr('event.coorg.note')}</p>
        </Modal>
      )}
    </>
  )
}
