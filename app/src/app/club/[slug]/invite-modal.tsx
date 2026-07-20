'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClubInvitation } from '@/app/actions'

export function InviteModal({ clubId, slug, clubName }: { clubId: string; slug: string; clubName: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    const fd = new FormData()
    fd.set('email', email)
    fd.set('phone', phone)
    startTransition(async () => {
      await createClubInvitation(clubId, slug, fd)
      setOpen(false)
      setEmail('')
      setPhone('')
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[12.5px] font-bold text-honey-700">
        ＋ Invitar
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={`Invitar a ${clubName}`}
          subtitle="Si dejas un correo, la invitación se manda sola"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending || (!email.trim() && !phone.trim())} onClick={submit}>
                Enviar invitación
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Input label="Correo" type="email" placeholder="nombre@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <Input label="O WhatsApp" placeholder="+52 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </Modal>
      )}
    </>
  )
}
