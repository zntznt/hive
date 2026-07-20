'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea, Input } from '@/components/ui/Input'
import { updateClubAbout } from '@/app/actions'

export function AboutEditor({
  clubId,
  slug,
  isAdmin,
  description,
  whatsappLink,
}: {
  clubId: string
  slug: string
  isAdmin: boolean
  description: string
  whatsappLink: string
}) {
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState(description)
  const [wa, setWa] = useState(whatsappLink)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    const fd = new FormData()
    fd.set('description', desc)
    fd.set('whatsapp_link', wa)
    startTransition(async () => {
      await updateClubAbout(clubId, slug, fd)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button aria-label="Editar acerca de" onClick={() => setOpen(true)} className="flex-shrink-0 p-0.5 text-xs text-ink-300">
        ✏️
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Editar acerca de"
          subtitle={isAdmin ? undefined : 'Un admin va a aprobar tus cambios'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending} onClick={submit}>
                {isAdmin ? 'Guardar' : 'Enviar para aprobación'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Textarea label="Descripción" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            <Input label="Grupo de WhatsApp (opcional)" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="chat.whatsapp.com/…" />
          </div>
        </Modal>
      )}
    </>
  )
}
