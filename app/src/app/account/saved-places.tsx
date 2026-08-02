'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { LocationPicker } from '@/components/ui/LocationPicker'
import { type Point } from '@/components/ui/PinMap'
import { addSavedPlace, updateSavedPlace, removeSavedPlace } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { useT, useTf } from '@/components/ui/LangProvider'

export type Place = { id: string; name: string; addr: string | null; query: string; lat: number | null; lng: number | null; area: string | null }

// "Places you can host" on Account. Feeds LocationPicker's "tus lugares"
// suggestions when setting an event's location, across every club.
//
// Three things were wrong with it. Saving with only one field filled produced
// a row anyway, because the form copied the address into the name when the
// name was blank, so a half-finished place looked saved. There was no way to
// fix one afterwards, only Quitar and start again, which loses the pin. And
// the pin did not exist: the address was a string handed to a map embed, so
// the map went wherever Google read it, and nobody could say otherwise.
//
// One form, used for both adding and editing, because they are the same four
// fields and a second copy would be a second place for them to drift.
export function SavedPlaces({ places }: { places: Place[] }) {
  const tr = useT()
  const tf = useTf()
  // null = the add form, an id = editing that row
  const [editing, setEditing] = useState<string | null>(null)
  const [key, setKey] = useState(0)
  const [name, setName] = useState('')
  const [where, setWhere] = useState<{ text: string; point: Point | null }>({ text: '', point: null })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const target = editing ? places.find((p) => p.id === editing) ?? null : null
  // Both halves, which is the rule the server enforces and this button obeys
  // rather than letting somebody press it and be told no.
  const complete = !!name.trim() && !!where.text.trim()

  function reset() {
    setEditing(null)
    setName('')
    setWhere({ text: '', point: null })
    setError(null)
    // Remounts the picker so its internal text, pin and geocoder state go with
    // the form rather than surviving into the next one.
    setKey((k) => k + 1)
  }

  function startEdit(p: Place) {
    setEditing(p.id)
    setName(p.name)
    setWhere({ text: p.addr ?? p.query, point: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null })
    setError(null)
    setKey((k) => k + 1)
  }

  function submit(formData: FormData) {
    formData.set('name', name.trim())
    setError(null)
    startTransition(async () => {
      const res = editing ? await updateSavedPlace(editing, formData) : await addSavedPlace(formData)
      if (res && !res.ok) {
        setError(res.error)
        return
      }
      reset()
      router.refresh()
    })
  }

  return (
    <section className="mt-[18px]">

      {places.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {places.map((p) => (
            <div
              key={p.id}
              className="flex items-start justify-between gap-2.5 rounded-md border border-line-card bg-paper px-3.5 py-2.5"
            >
              <span className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 text-[13px]" aria-hidden="true">
                  <Icon name="star" size={12} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink-900">{p.name}</span>
                  {p.addr && <span className="block text-[12.5px] text-ink-500">{p.addr}</span>}
                  {/* Whether this place has a point, said plainly. A place
                      without one still works, it is just the map guessing from
                      the words, and that is worth knowing before somebody
                      drives to it. */}
                  {p.lat == null && (
                    <span className="mt-0.5 block text-[11.5px] text-ink-300">{tr('account.place.noPin')}</span>
                  )}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className="tap text-[12.5px] font-bold text-honey-700"
                >
                  Editar
                </button>
                <form action={removeSavedPlace.bind(null, p.id)}>
                  <button className="tap text-[12.5px] font-bold text-ink-500">{tr('common.remove')}</button>
                </form>
              </span>
            </div>
          ))}
        </div>
      )}

      <form action={submit} className="flex flex-col gap-2.5">
        {target && (
          <p className="text-[12.5px] font-bold text-ink-700">Editando {target.name}</p>
        )}
        <Input
          label={tr('account.place.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr('account.place.ph')}
          maxLength={60}
        />
        <LocationPicker
          key={key}
          name="addr"
          label={tr('account.place.addr')}
          defaultValue={target?.addr ?? target?.query ?? ''}
          defaultPoint={target?.lat != null && target?.lng != null ? { lat: target.lat, lng: target.lng } : null}
          defaultArea={target?.area ?? null}
          onChange={setWhere}
        />
        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={pending || !complete}>
            {pending ? tr('common.saving') : target ? tr('form.saveChanges') : tr('account.place.save')}
          </Button>
          {target && (
            <button type="button" onClick={reset} className="tap text-[12.5px] font-bold text-ink-500">
              Cancelar
            </button>
          )}
          {!complete && !pending && (
            <span className="text-[11.5px] text-ink-300">{tr('account.place.missing')}</span>
          )}
        </div>
      </form>

      <p className="mt-2.5 text-xs text-ink-300">
        {/* The bolded phrase is inside the sentence, and Spanish and English
            put it in different places, so the whole sentence is one string with
            a slot rather than three fragments glued together. */}
        {tf('account.places.note', { yours: tr('account.place.yours') })}
      </p>
    </section>
  )
}
