'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { useT, useTf } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { createClubInvitation } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

// Renders its own trigger by default. Pass `open` and `onClose` to drive it
// from somewhere else, which is what the club page's AppBar does: the kit
// gives that bar exactly one primary action and this is it.
export function InviteModal({
  clubId,
  slug,
  clubName,
  isAdmin,
  open: openProp,
  onClose,
}: {
  clubId: string
  slug: string
  clubName: string
  isAdmin: boolean
  open?: boolean
  onClose?: () => void
}) {
  const tr = useT()
  const tf = useTf()
  const [selfOpen, setSelfOpen] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : selfOpen
  const setOpen = (v: boolean) => {
    if (controlled) {
      if (!v) onClose?.()
    } else setSelfOpen(v)
  }
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('member')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function submit() {
    const fd = new FormData()
    fd.set('email', email)
    fd.set('phone', phone)
    fd.set('invited_role', role)
    startTransition(async () => {
      await createClubInvitation(clubId, slug, fd)
      setOpen(false)
      toast(tf('club.inviteSentTo', { to: email.trim() || phone.trim() }))
      setEmail('')
      setPhone('')
      setRole('member')
      router.refresh()
    })
  }

  return (
    <>
      {!controlled && (
        <button onClick={() => setOpen(true)} className="tap text-[12.5px] font-bold text-honey-700">
          <Icon name="plus" size={10} /> Invitar
        </button>
      )}
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={tf('club.inviteTo', { club: clubName })}
          subtitle={tr('club.invite.auto')}
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
            <Input label={tr('club.invite.email')} type="email" placeholder={tr('club.invite.emailPh')} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <Input label={tr('club.invite.whatsapp')} placeholder="+52 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Select
              label={tr('club.invite.role')}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!isAdmin}
              hint={isAdmin ? undefined : tr('club.invite.note')}
            >
              <option value="member">{tr('role.member')}</option>
              {isAdmin && <option value="organizer">{tr('role.organizer')}</option>}
              {isAdmin && <option value="admin">{tr('role.admin')}</option>}
            </Select>
          </div>
        </Modal>
      )}
    </>
  )
}
