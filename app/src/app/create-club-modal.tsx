'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useT } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { createClub } from '@/app/actions'

// Home's "crear un club" opens in place (design: Home.jsx modal); on success
// createClub redirects straight to the new club's page.
export function CreateClubButton() {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    const fd = new FormData()
    fd.set('name', name)
    startTransition(async () => {
      await createClub(fd)
    })
  }

  return (
    <>
      {/* The full-width secondary block the kit draws, with the hint under it.
          It was a compact pill on the reasoning that creating a club is rare,
          which is true and is beside the point: the one screen where somebody
          has no clubs is the one where this is the only thing to do, and a
          pill among a stack of cards reads as a filter rather than the way in.
          The sentence under it is what the modal would have told them anyway,
          said before they commit rather than after. */}
      <Button variant="secondary" block icon={<Icon name="plus" size={12} />} onClick={() => setOpen(true)}>
        {tr('club.create')}
      </Button>
      <p className="mt-2.5 text-xs leading-relaxed text-ink-300">{tr('clubs.createHint')}</p>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={tr('club.create.modal')}
          subtitle={tr('club.create.firstAdmin')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {tr('common.cancel')}
              </Button>
              <Button disabled={pending || !name.trim()} onClick={submit}>
                {pending ? tr('club.creating') : tr('club.create')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <Input label={tr('club.name')} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('club.name.ph')} autoFocus />
            <p className="mt-1 text-xs text-ink-300">{tr('club.create.next')}</p>
          </div>
        </Modal>
      )}
    </>
  )
}
