'use client'

import { useEffect, useRef, useState } from 'react'
import { updateProfile } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { BugAvatarPicker, randomBugAvatar } from '@/components/ui/BugAvatar'
import { t, type Lang } from '@/lib/lang'
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
  lang: Lang
  // The language control is passed in rather than imported, so this component
  // stays about the avatar and the name and the page keeps deciding what else
  // belongs in the group.
  language?: React.ReactNode
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
  lang,
  language,
}: Props) {
  const toast = useToast()
  // A member who has never opened this screen has no avatar of their own, so
  // they are dealt one rather than being handed the first of each list.
  // Rolled once in the initialiser so a re-render never reshuffles it, and
  // written back on mount so what they were dealt is what everyone else sees.
  const dealt = useRef(randomBugAvatar())
  const [bug, setBug] = useState(avatarBug || dealt.current.bug)
  const [color, setColor] = useState(avatarColor || dealt.current.color)
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
    } catch {
      // e.message from a server action is Next's sanitised paragraph in
      // production, so prefixing it with our own sentence produced a Spanish
      // opener onto an English wall of internals. The written copy is better
      // on its own.
      setError(t(lang, 'account.photo.failed'))
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
      setError(t(lang, 'common.needName'))
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
      toast(t(lang, 'common.saved'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t(lang, 'common.notSaved'))
    } finally {
      setSaving(false)
    }
  }

  // Emitted on mount only when the person had none, so the deal is what gets
  // saved. Not on every mount: it must not overwrite a choice.
  const dealtEmitted = useRef(false)
  useEffect(() => {
    if (dealtEmitted.current) return
    dealtEmitted.current = true
    if (!avatarBug || !avatarColor) save({ bug: dealt.current.bug, color: dealt.current.color })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <section>
        <BugAvatarPicker
          bug={bug}
          color={color}
          name={name}
          photoUrl={photoUrl}
          lang={lang}
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
          {uploading ? t(lang, 'common.saving') : photoUrl ? t(lang, 'account.photo.change') : t(lang, 'account.photo')}
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
            {t(lang, 'account.photo.back')}
          </button>
        )}
        <p className="mt-2.5 text-xs text-ink-300">
          {kind === 'photo'
            ? t(lang, 'account.photo.hint')
            : t(lang, 'account.bug.hint')}
        </p>

        <div className="mt-3.5">
          <Input
            label={t(lang, 'account.name')}
            name="display_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== displayName && save({ name })}
            required
            maxLength={60}
          />
        </div>
        {language}
        {error && <p className="mt-2.5 rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        {saving && <p className="mt-2 text-xs text-ink-300">{t(lang, 'common.saving')}</p>}
      </section>

      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          shape="hex"
          aspect={0.92}
          outWidth={512}
          title={t(lang, 'crop.title')}
          onCancel={() => setCropSrc(null)}
          onApply={onCropApply}
        />
      )}
    </>
  )
}
