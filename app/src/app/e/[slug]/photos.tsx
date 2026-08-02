'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addEventPhoto, removeEventPhoto } from '@/app/actions'
import { downscaleToDataUrl } from '@/lib/downscale'
import { dataUrlToBlob } from '@/lib/upload'
import { useToast } from '@/components/ui/Toast'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useLang, useT, useTf } from '@/components/ui/LangProvider'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { timeAgo } from '@/lib/relative-time'

// The album. Everything else about the evening already lives here, so the
// photos leaking to the group chat is the app handing back the one thing it
// was built to replace.
//
// One add control, never two. accept="image/*" already makes the phone offer
// camera or library in its own sheet, so "take a photo" and "choose a photo"
// would be two buttons for one decision the OS is better at.
//
// When you cannot add, the grid says why instead of hiding the control: the
// album is visibly there with other people's photos in it, so a missing button
// reads as a bug rather than a closed door.

export type EventPhoto = {
  id: string
  url: string
  by: string
  byUser: AvatarUser
  at: string
  canRemove: boolean
}

export default function Photos({
  eventId,
  slug,
  photos,
  canAdd,
  reason,
}: {
  eventId: string
  slug: string
  photos: EventPhoto[]
  canAdd: boolean
  reason?: string
}) {
  const lang = useLang()
  const tr = useT()
  const tf = useTf()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const router = useRouter()
  const toast = useToast()

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setError(null)
    startTransition(async () => {
      try {
        for (const f of files) {
          // same treatment as the payment proof: a photo off a phone camera is
          // three to five megabytes and the bucket stops at two
          const blob = await dataUrlToBlob(await downscaleToDataUrl(f, tr))
          const fd = new FormData()
          fd.set('file', new File([blob], 'foto.jpg', { type: 'image/jpeg' }))
          await addEventPhoto(eventId, slug, fd)
        }
        toast(files.length === 1 ? tr('photos.added1') : tf('photos.addedN', { n: files.length }))
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : tr('photos.uploadFailed'))
      }
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await removeEventPhoto(id, slug)
        setOpen(null)
        toast(tr('photos.removed'))
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : tr('photos.removeFailed'))
      }
    })
  }

  const shown = open != null ? photos[open] : null

  // Three rows of tiles, and past that a count. A club that shot forty photos
  // used to get fourteen rows of thumbnails between the roll call and the
  // question of doing it again, which turns the album from a thing on the page
  // into the page.
  const cells = 9 - (canAdd ? 1 : 0)
  const overflow = !showAll && photos.length > cells ? photos.length - (cells - 1) : 0
  const visible = overflow ? photos.slice(0, cells - 1) : photos

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {canAdd && (
          <label
            className={`tap flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-line-input bg-cream-sunk text-ink-500 ${
              pending ? 'opacity-60' : ''
            }`}
          >
            <Icon name="camera" size={16} />
            <span className="text-[11.5px] font-bold">{pending ? tr('common.saving') : tr('photos.add')}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} disabled={pending} />
          </label>
        )}

        {visible.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className="tap aspect-square overflow-hidden rounded-md border border-line-card bg-cream-sunk"
            aria-label={tf('photos.by', { name: p.by })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={tf('photos.by', { name: p.by })} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}

        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="tap flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border border-line-card bg-cream-sunk"
          >
            <span className="font-display text-[17px] font-bold text-ink-900">+{overflow}</span>
            <span className="text-[11.5px] font-bold text-ink-500">{tr('common.seeAllF')}</span>
          </button>
        )}
      </div>

      {!canAdd && reason && <p className="mt-2.5 text-xs leading-relaxed text-ink-300">{reason}</p>}
      {photos.length === 0 && canAdd && (
        <p className="mt-2.5 text-xs leading-relaxed text-ink-300">
          {tr('photos.empty')}
        </p>
      )}
      {error && <p className="mt-2.5 rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}

      {shown && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={shown.by}
          subtitle={timeAgo(shown.at, lang)}
          footer={
            <>
              {photos.length > 1 && (
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ((o ?? 0) - 1 + photos.length) % photos.length)}
                    aria-label={tr('event.prev')}
                    className="tap grid h-11 w-11 place-items-center rounded-pill border-[1.5px] border-line-card bg-paper text-ink-700"
                  >
                    <Icon name="chevron-left" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ((o ?? 0) + 1) % photos.length)}
                    aria-label={tr('event.next')}
                    className="tap grid h-11 w-11 place-items-center rounded-pill border-[1.5px] border-line-card bg-paper text-ink-700"
                  >
                    <Icon name="chevron-right" size={12} />
                  </button>
                </span>
              )}
              <span className="flex-1" />
              {shown.canRemove && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(shown.id)}
                  className="tap inline-flex min-h-11 items-center rounded-pill border-[1.5px] border-danger-bg bg-paper px-4 text-[12.5px] font-bold text-danger"
                >
                  {tr(pending ? 'photos.removing' : 'common.remove')}
                </button>
              )}
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown.url} alt={tf('photos.by', { name: shown.by })} className="max-h-[60vh] w-full rounded-md object-contain" />
            <span className="flex items-center gap-2.5 text-[12.5px] text-ink-500">
              <UserAvatar user={shown.byUser} size={24} />
              {tf('photos.uploadedBy', { name: shown.by, ago: timeAgo(shown.at, lang) })}
            </span>
          </div>
        </Modal>
      )}
    </>
  )
}
