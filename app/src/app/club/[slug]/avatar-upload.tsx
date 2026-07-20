'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { dataUrlToBlob, uploadBanner } from '@/lib/upload'
import { updateClubAvatar } from '@/app/actions'

// Reuses the club-manager-writable "banners" storage bucket/policy (folder =
// club id) for the club picture too, just under a distinct filename prefix -
// avoids a whole new bucket+policy pair for one more club-scoped image.
export function AvatarUpload({ clubId, slug, clubName, avatarUrl }: { clubId: string; slug: string; clubName: string; avatarUrl: string | null }) {
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

  function apply(dataUrl: string) {
    setPickedSrc(null)
    startTransition(async () => {
      const blob = await dataUrlToBlob(dataUrl)
      const url = await uploadBanner(clubId, blob)
      await updateClubAvatar(clubId, slug, url)
      router.refresh()
    })
  }

  return (
    <span className="relative inline-flex">
      <HexAvatar name={clubName} size={40} src={avatarUrl} />
      <label
        title="Cambiar foto del club"
        className="absolute -bottom-1 -right-2 grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-paper text-[9px] text-ink-700 shadow-card"
      >
        {pending ? '…' : '📷'}
        <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={pending} />
      </label>
      {pickedSrc && (
        <ImageCropModal
          src={pickedSrc}
          aspect={0.92}
          shape="hex"
          outWidth={512}
          title="Encuadra la foto del club"
          onCancel={() => setPickedSrc(null)}
          onApply={apply}
        />
      )}
    </span>
  )
}
