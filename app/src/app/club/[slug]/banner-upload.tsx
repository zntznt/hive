'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { dataUrlToBlob, uploadBanner } from '@/lib/upload'
import { updateClubBanner } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

export function BannerUpload({ clubId, slug }: { clubId: string; slug: string }) {
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
      await updateClubBanner(clubId, slug, url)
      router.refresh()
    })
  }

  return (
    <>
      <label
        title="Cambiar portada"
        className="tap absolute right-2.5 top-2.5 grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full bg-paper text-[13px] text-ink-700 shadow-card"
      >
        {pending ? '…' : <Icon name="camera" size={13} />}
        <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={pending} />
      </label>
      {pickedSrc && (
        <ImageCropModal
          src={pickedSrc}
          aspect={4}
          shape="rect"
          outWidth={1280}
          title="Encuadra la portada"
          onCancel={() => setPickedSrc(null)}
          onApply={apply}
        />
      )}
    </>
  )
}
