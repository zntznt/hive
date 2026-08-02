'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { useT } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { Textarea, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { updateClubProfile } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

type LinkRow = { label: string; url: string }

// The club's name, description and links, in one modal behind one pencil.
//
// The name used to be unchangeable, and when it became changeable the obvious
// move was a second pencil beside the first. Two pencils on one line, one for
// the name and one for everything else, is two controls for one subject: what
// this club is. The name goes at the top of the modal that was already there.
export function ClubProfileEditor({
  clubId,
  slug,
  isAdmin,
  name: currentName,
  description,
  links,
}: {
  clubId: string
  slug: string
  isAdmin: boolean
  name: string
  description: string
  links: LinkRow[]
}) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
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
    fd.set('name', name)
    fd.set('description', desc)
    for (const r of rows) {
      fd.append('link_label', r.label)
      fd.append('link_url', r.url)
    }
    startTransition(async () => {
      const res = await updateClubProfile(clubId, slug, fd)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError(null)
      setOpen(false)
      toast(isAdmin ? tr('club.profile.saved') : tr('club.about.sent'))
      router.refresh()
    })
  }

  return (
    <>
      <button aria-label={tr('club.profile.edit')} onClick={() => setOpen(true)} className="tap flex-shrink-0 p-0.5 text-xs text-ink-300">
        <Icon name="pen" size={12} />
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={tr('club.profile.edit')}
          subtitle={isAdmin ? undefined : tr('club.about.willApprove')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {tr('common.cancel')}
              </Button>
              <Button disabled={pending} onClick={submit}>
                {tr(isAdmin ? 'common.save' : 'club.about.submit')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            {/* First, because it is the field somebody opened this to change,
                and because a club with no name is the one state this refuses. */}
            <Input
              label={tr('club.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('club.name.ph')}
              maxLength={60}
            />
            <Textarea label={tr('club.about.desc')} value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{tr('club.about.links')}</label>
              <div className="flex flex-col gap-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={r.label}
                      placeholder={tr('club.about.linkLabel')}
                      onChange={(e) => updateLink(i, { label: e.target.value })}
                      className="w-[38%] flex-none"
                    />
                    <Input value={r.url} placeholder="link.com/…" onChange={(e) => updateLink(i, { url: e.target.value })} className="flex-1" />
                    <button aria-label={tr('club.about.removeLink')} onClick={() => removeLink(i)} className="tap flex-shrink-0 text-ink-300">
                      <Icon name="xmark" size={12} />
                    </button>
                  </div>
                ))}
                {rows.length < 4 && (
                  <button onClick={addLink} className="tap self-start text-[12.5px] font-bold text-honey-700">
                    <Icon name="plus" size={10} /> {tr('club.addLink')}
                  </button>
                )}
              </div>
            </div>
            {error && <p className="rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}
