'use client'

import { useRef, useState } from 'react'
import { updateProfile } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
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

// Who you are: the bug, the colour, the photo, the name. One section, and no
// Save button.
//
// It used to be two, "Tu bicho" and "Perfil", with the save button under the
// second one. So picking a spider changed the hexagon in front of you and
// changed nothing in the database, and the control that committed it was a
// heading away, under a name field you had not touched. Every pick looked
// applied and most of them were not.
//
// A bug and a colour are single taps with an immediate preview, so they commit
// on the tap. The name commits when you leave the field, and only if you
// changed it. Each write goes through updateProfile with the whole set, which
// is what that action expects, so a change to one never blanks another.
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
  const [name, setName] = useState(displayName)
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
      await save({ photoUrl: url })
    } catch (e) {
      setError(e instanceof Error ? `No se pudo subir la foto. ${e.message}` : 'No se pudo subir la foto. Intenta de nuevo.')
    } finally {
      setUploading(false)
    }
  }

  // One writer for all four fields. Callers pass only what changed; everything
  // else comes from the state that is already on screen.
  async function save(next: Partial<{ bug: string; color: string; photoUrl: string | null; name: string }>) {
    const b = next.bug ?? bug
    const c = next.color ?? color
    const p = next.photoUrl !== undefined ? next.photoUrl : photoUrl
    const n = next.name ?? name
    if (!n.trim()) {
      setError('Necesitas un nombre visible.')
      return
    }
    setSaving(true)
    setError(null)
    const fd = new FormData()
    fd.set('display_name', n.trim())
    fd.set('avatar_kind', p ? 'photo' : 'bug')
    fd.set('avatar_bug', b)
    fd.set('avatar_color', c)
    fd.set('avatar_photo_url', p ?? '')
    try {
      await updateProfile(fd)
      toast('Listo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section>
        <p className="eyebrow mb-2.5">Tú</p>
        <BugAvatarPicker
          bug={bug}
          color={color}
          onChange={({ bug: b, color: c }) => {
            setBug(b)
            setColor(c)
            save({ bug: b, color: c })
          }}
        />
        {/* Full width and under the pickers, because it is the third way to
            answer the same question the two rows above it answer, not a
            footnote to them. */}
        <label className="tap mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-pill border-[1.5px] border-line-input bg-paper px-3.5 text-[13px] font-bold text-ink-700">
          {photoUrl && <HexAvatar name={name} size={26} src={photoUrl} />}
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
            onClick={() => {
              setPhotoUrl(null)
              save({ photoUrl: null })
            }}
            className="tap mt-2 block w-full text-center text-[12.5px] font-bold text-ink-500"
          >
            Volver a tu bicho
          </button>
        )}
        <p className="mt-2.5 text-xs text-ink-300">
          {kind === 'photo'
            ? 'Tu foto se muestra en vez de tu bicho, con el mismo recorte hexagonal.'
            : 'Elige un bicho y un color para que el club te distinga a simple vista.'}
        </p>

        <div className="mt-3.5">
          <Input
            label="Nombre visible"
            name="display_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== displayName && save({ name })}
            required
            maxLength={60}
          />
        </div>
        {error && <p className="mt-2.5 rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        {saving && <p className="mt-2 text-xs text-ink-300">Guardando…</p>}
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
