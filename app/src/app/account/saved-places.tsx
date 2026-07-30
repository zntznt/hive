'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Input } from '@/components/ui/Input'
import { LocationPicker } from '@/components/ui/LocationPicker'
import { addSavedPlace, removeSavedPlace } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

type Place = { id: string; name: string; addr: string | null; query: string }

// "Places you can host" on Account - feeds LocationPicker's "your places"
// suggestions when setting an event's location, across every club.
export function SavedPlaces({ places }: { places: Place[] }) {
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  function submit(formData: FormData) {
    const addr = String(formData.get('addr') ?? '').trim()
    formData.set('name', name.trim() || addr)
    formData.set('query', addr)
    startTransition(async () => {
      await addSavedPlace(formData)
      setName('')
      formRef.current?.reset()
      router.refresh()
    })
  }

  return (
    <section className="mb-6">
      <SectionHeader>Lugares donde puedes ser anfitrión</SectionHeader>
      {places.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {places.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2.5 rounded-md border border-line-card bg-paper px-3.5 py-2.5">
              <span className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 text-[13px]" aria-hidden="true">
                  <Icon name="star" size={12} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink-900">{p.name}</span>
                  {p.addr && <span className="text-[12.5px] text-ink-500">{p.addr}</span>}
                </span>
              </span>
              <form action={removeSavedPlace.bind(null, p.id)} className="flex-shrink-0">
                <button className="tap text-[12.5px] font-bold text-ink-500">Quitar</button>
              </form>
            </div>
          ))}
        </div>
      )}
      <form ref={formRef} action={submit} className="flex flex-col gap-2.5">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Casa de Marta" />
        <LocationPicker name="addr" label="Dirección" />
        <button disabled={pending} className="tap self-start text-[12.5px] font-bold text-honey-700 disabled:opacity-60">
          {pending ? 'Guardando…' : '＋ Guardar lugar'}
        </button>
      </form>
      <p className="mt-2.5 text-xs text-ink-300">
        Aparecen como <b className="text-ink-500">tus lugares</b> cuando pones el lugar de un evento que organizas.
      </p>
    </section>
  )
}
