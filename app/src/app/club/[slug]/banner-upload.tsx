'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { dataUrlToBlob, uploadBanner } from '@/lib/upload'
import { updateClubBanner } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'
import { BANNER_ASPECT } from '@/lib/banner'
import { useToast } from '@/components/ui/Toast'
import { useT } from '@/components/ui/LangProvider'

export function BannerUpload({ clubId, slug }: { clubId: string; slug: string }) {
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

  // Same as the club picture beside it: a failure has to be a sentence, not
  // an error boundary. See the note in avatar-upload.tsx.
  function apply(dataUrl: string) {
    setPickedSrc(null)
    startTransition(async () => {
      try {
        const blob = await dataUrlToBlob(dataUrl)
        const url = await uploadBanner(clubId, blob)
        await updateClubBanner(clubId, slug, url)
        router.refresh()
      } catch {
        toast(tr('account.photo.failed'))
      }
    })
  }

  return (
    <>
      {/* A 30px circle inside a 44px target, and the header places it. It used
          to position itself as well as being placed by an absolutely
          positioned wrapper, so the two offsets stacked and the chip sat 10px
          further in than either of them meant. */}
      <label
        title={tr('club.banner.change')}
        className="tap grid h-11 w-11 cursor-pointer place-items-center"
      >
        <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-paper text-ink-700 shadow-card">
          {pending ? '…' : <Icon name="camera" size={13} />}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={pending} />
      </label>
      {pickedSrc && (
        <ImageCropModal
          src={pickedSrc}
          aspect={BANNER_ASPECT}
          shape="rect"
          outWidth={1280}
          title={tr('club.banner.crop')}
          onCancel={() => setPickedSrc(null)}
          onApply={apply}
        />
      )}
    </>
  )
}
