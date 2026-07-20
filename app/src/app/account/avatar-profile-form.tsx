'use client'

import { useRef, useState } from 'react'
import { updateProfile } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { BugAvatarPicker } from '@/components/ui/BugAvatar'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { uploadAvatarPhoto, dataUrlToBlob } from '@/lib/upload'

type Props = {
  userId: string
  displayName: string
  avatarKind: 'bug' | 'photo'
  avatarBug: string
  avatarColor: string
  avatarPhotoUrl: string | null
}

// Avatar (bug or photo) + display name, both saved together through
// updateProfile (it reads all four avatar_* fields plus display_name from
// one FormData).
export default function AvatarProfileForm({
  userId,
  displayName,
  avatarKind,
  avatarBug,
  avatarColor,
  avatarPhotoUrl,
}: Props) {
  const toast = useToast()
  const [bug, setBug] = useState(avatarBug)
  const [color, setColor] = useState(avatarColor)
  // photoUrl doubles as "using a photo": present -> avatar_kind is photo,
  // cleared -> back to the bug (mirrors the design prototype's Back to my bug).
  const [photoUrl, setPhotoUrl] = useState<string | null>(avatarKind === 'photo' ? avatarPhotoUrl : null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const kind: 'bug' | 'photo' = photoUrl ? 'photo' : 'bug'

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result as string)
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  async function onCropApply(dataUrl: string) {
    setCropSrc(null)
    setUploading(true)
    setError(null)
    try {
      const blob = await dataUrlToBlob(dataUrl)
      const url = await uploadAvatarPhoto(userId, blob)
      setPhotoUrl(url)
    } catch {
      setError('No se pudo subir la foto. Intenta de nuevo.')
    } finally {
      setUploading(false)
    }
  }

  async function submit(formData: FormData) {
    setSaving(true)
    setError(null)
    try {
      await updateProfile(formData)
      toast('Perfil actualizado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="mb-6">
        <SectionHeader>Tu bicho</SectionHeader>
        <BugAvatarPicker bug={bug} color={color} onChange={({ bug: b, color: c }) => { setBug(b); setColor(c) }} />
        <div className="mt-3 flex items-center gap-3">
          {photoUrl && <HexAvatar name={displayName} size={44} src={photoUrl} />}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill border-[1.5px] border-line-input bg-paper px-3.5 py-1.5 text-[12.5px] font-bold text-ink-700">
            {uploading ? 'Subiendo…' : photoUrl ? 'Cambiar foto' : 'O usa tu propia foto'}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
              disabled={uploading}
            />
          </label>
          {photoUrl && (
            <button
              type="button"
              onClick={() => setPhotoUrl(null)}
              className="text-[12.5px] font-bold text-ink-500"
            >
              Volver a tu bicho
            </button>
          )}
        </div>
        <p className="mt-2.5 text-xs text-ink-300">
          {kind === 'photo'
            ? 'Tu foto se muestra en vez de tu bicho, con el mismo recorte hexagonal.'
            : 'Elige un bicho y un color para que el club te distinga a simple vista.'}
        </p>
      </section>

      <section className="mb-6">
        <SectionHeader>Perfil</SectionHeader>
        <form action={submit} className="flex flex-col gap-3.5">
          <Input label="Nombre" name="display_name" defaultValue={displayName} required maxLength={60} />
          <input type="hidden" name="avatar_kind" value={kind} />
          <input type="hidden" name="avatar_bug" value={bug} />
          <input type="hidden" name="avatar_color" value={color} />
          <input type="hidden" name="avatar_photo_url" value={photoUrl ?? ''} />
          {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={saving || uploading}>
            {saving ? 'Guardando…' : 'Guardar perfil'}
          </Button>
        </form>
      </section>

      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          shape="hex"
          aspect={0.92}
          outWidth={512}
          title="Encuadra tu foto"
          onCancel={() => setCropSrc(null)}
          onApply={onCropApply}
        />
      )}
    </>
  )
}
