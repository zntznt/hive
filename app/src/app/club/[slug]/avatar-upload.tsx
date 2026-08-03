'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { dataUrlToBlob, uploadBanner } from '@/lib/upload'
import { updateClubAvatar } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { useT } from '@/components/ui/LangProvider'

// Reuses the club-manager-writable "banners" storage bucket/policy (folder =
// club id) for the club picture too, just under a distinct filename prefix -
// avoids a whole new bucket+policy pair for one more club-scoped image.
export function AvatarUpload({ clubId, slug, clubName, avatarUrl, size = 40 }: { clubId: string; slug: string; clubName: string; avatarUrl: string | null; size?: number }) {
  const tr = useT()
  const toast = useToast()
  const [pickedSrc, setPickedSrc] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPickedSrc(reader.result as string)
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  // An upload that fails says so. Unhandled, the rejected promise inside a
  // transition reaches the error boundary and takes the whole page with it:
  // "A server error occurred. Reload to try again." over a club that is
  // otherwise fine, from a photo that was merely too big or the wrong type.
  // The member's own avatar has caught this since it was written; the club's
  // never did.
  function apply(dataUrl: string) {
    setPickedSrc(null)
    startTransition(async () => {
      try {
        const blob = await dataUrlToBlob(dataUrl)
        const url = await uploadBanner(clubId, blob)
        await updateClubAvatar(clubId, slug, url)
        router.refresh()
      } catch {
        toast(tr('account.photo.failed'))
      }
    })
  }

  return (
    <span className="relative inline-flex">
      <HexAvatar name={clubName} size={size} src={avatarUrl} />
      {/* The chip is small so it does not sit on the club's face, but the tap
          area around it is the full 44px, extending down and to the right
          where there is nothing else to hit. */}
      <label
        title={tr('club.avatar.change')}
        className="tap absolute -bottom-1.5 -right-[11px] grid h-11 w-11 cursor-pointer place-items-center"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-paper text-ink-700 shadow-card">
          {pending ? '…' : <Icon name="camera" size={13} />}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={pending} />
      </label>
      {pickedSrc && (
        <ImageCropModal
          src={pickedSrc}
          aspect={0.92}
          shape="hex"
          outWidth={512}
          title={tr('club.avatar.crop')}
          onCancel={() => setPickedSrc(null)}
          onApply={apply}
        />
      )}
    </span>
  )
}
