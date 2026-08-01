'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClub } from '@/app/actions'

// Home's "crear un club" opens in place (design: Home.jsx modal); on success
// createClub redirects straight to the new club's page.
export function CreateClubButton() {
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
      {/* A compact header action, not a full-width block. It sits in the
          PageHeader's action slot beside the title, the same place "Nuevo
          evento" sits on the club page; creating a club is rare and does not
          earn a full row above the clubs you already have. */}
      <button
        onClick={() => setOpen(true)}
        className="tap inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-pill border-[1.5px] border-line-input bg-paper px-3.5 text-[13px] font-extrabold text-ink-700"
      >
        <span aria-hidden="true">+</span> Crear club
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Crear un club"
          subtitle="Vas a ser su primer admin"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending || !name.trim()} onClick={submit}>
                {pending ? 'Creando…' : 'Crear club'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <Input label="Nombre del club" value={name} onChange={(e) => setName(e.target.value)} placeholder="Los Jueves" autoFocus />
            <p className="mt-1 text-xs text-ink-300">Después: invita gente y crea tu primer evento.</p>
          </div>
        </Modal>
      )}
    </>
  )
}
