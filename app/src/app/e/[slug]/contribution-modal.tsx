'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { addContribution, updateContribution } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

type Member = { user_id: string; name: string }

export function AddContributionButton({
  eventId,
  slug,
  isOrganizer,
  members,
}: {
  eventId: string
  slug: string
  isOrganizer: boolean
  members: Member[]
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [qty, setQty] = useState('')
  const [kind, setKind] = useState('bring')
  const [assignedTo, setAssignedTo] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function submit() {
    const fd = new FormData()
    fd.set('title', title)
    fd.set('qty', qty)
    fd.set('kind', kind)
    fd.set('assigned_to', assignedTo)
    startTransition(async () => {
      await addContribution(eventId, slug, fd)
      setOpen(false)
      toast('Añadido a aportaciones.')
      setTitle('')
      setQty('')
      setAssignedTo('')
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="tap text-[12.5px] font-bold text-honey-700">
        <Icon name="plus" size={10} /> Añadir
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Añadir aportación"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending || !title.trim()} onClick={submit}>
                Añadir
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Input
              label={isOrganizer ? 'Qué hace falta' : 'Qué vas a traer'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isOrganizer ? 'Hace falta…' : 'Yo traigo…'}
              autoFocus
            />
            <Input label="Cantidad (opcional)" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="cantidad" />
            <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="bring">traer algo</option>
              <option value="task">tarea</option>
            </Select>
            {isOrganizer && (
              <Select label="Para quién" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">para mí</option>
                <option value="open">abierto (que alguien se lo pida)</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    asignar a {m.name}
                  </option>
                ))}
              </Select>
            )}
            {!isOrganizer && <p className="text-xs text-ink-300">Te lo apuntas tú. Asignarle algo a alguien más lo hace quien organiza.</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

export function EditContributionButton({
  id,
  slug,
  title,
  qty,
}: {
  id: string
  slug: string
  title: string
  qty: string | null
}) {
  const [open, setOpen] = useState(false)
  const [t, setT] = useState(title)
  const [q, setQ] = useState(qty ?? '')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function submit() {
    const fd = new FormData()
    fd.set('title', t)
    fd.set('qty', q)
    startTransition(async () => {
      await updateContribution(id, slug, fd)
      setOpen(false)
      toast('Aportación actualizada.')
      router.refresh()
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Editar" className="tap border-none bg-transparent p-0 text-xs text-ink-300">
        <Icon name="pen" size={12} />
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Editar aportación"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending || !t.trim()} onClick={submit}>
                Guardar
              </Button>
            </>
          }
        >
          <div className="flex gap-2.5">
            <div className="flex-1">
              <Input label="Qué" value={t} onChange={(e) => setT(e.target.value)} autoFocus />
            </div>
            <div className="w-24">
              <Input label="Cantidad" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
