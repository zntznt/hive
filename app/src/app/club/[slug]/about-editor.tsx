'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { updateClubAbout } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

type LinkRow = { label: string; url: string }

export function AboutEditor({
  clubId,
  slug,
  isAdmin,
  description,
  links,
}: {
  clubId: string
  slug: string
  isAdmin: boolean
  description: string
  links: LinkRow[]
}) {
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState(description)
  const [rows, setRows] = useState<LinkRow[]>(links.length ? links : [])
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function addLink() {
    if (rows.length >= 4) return
    setRows((rs) => [...rs, { label: '', url: '' }])
  }
  function updateLink(i: number, patch: Partial<LinkRow>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function removeLink(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i))
  }

  function submit() {
    const fd = new FormData()
    fd.set('description', desc)
    for (const r of rows) {
      fd.append('link_label', r.label)
      fd.append('link_url', r.url)
    }
    startTransition(async () => {
      await updateClubAbout(clubId, slug, fd)
      setOpen(false)
      toast(isAdmin ? 'Acerca de actualizado.' : 'Enviado a los admins para aprobar.')
      router.refresh()
    })
  }

  return (
    <>
      <button aria-label="Editar acerca de" onClick={() => setOpen(true)} className="tap flex-shrink-0 p-0.5 text-xs text-ink-300">
        <Icon name="pen" size={12} />
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
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">Enlaces</label>
              <div className="flex flex-col gap-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={r.label}
                      placeholder="Etiqueta"
                      onChange={(e) => updateLink(i, { label: e.target.value })}
                      className="w-[38%] flex-none"
                    />
                    <Input value={r.url} placeholder="link.com/…" onChange={(e) => updateLink(i, { url: e.target.value })} className="flex-1" />
                    <button aria-label="Quitar enlace" onClick={() => removeLink(i)} className="tap flex-shrink-0 text-ink-300">
                      <Icon name="xmark" size={12} />
                    </button>
                  </div>
                ))}
                {rows.length < 4 && (
                  <button onClick={addLink} className="tap self-start text-[12.5px] font-bold text-honey-700">
                    <Icon name="plus" size={10} /> Añadir enlace
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
