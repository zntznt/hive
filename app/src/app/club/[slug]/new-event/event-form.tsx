'use client'

import { useActionState, useState } from 'react'
import { createEvent, updateEvent } from '@/app/actions'
import { Input, Select, Checkbox } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'
import { LocationPicker, type Place } from '@/components/ui/LocationPicker'

function toDatetimeLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card pad="sm">
      <div className="eyebrow mb-1">{legend}</div>
      {hint && <div className="mb-3 text-xs text-ink-300">{hint}</div>}
      <div className={hint ? undefined : 'mt-3'}>{children}</div>
    </Card>
  )
}

const HOURS = Array.from({ length: 25 }, (_, h) => ({
  value: h * 60,
  label: `${String(h).padStart(2, '0')}:00`,
}))

type Category = { id: string; name: string; emoji: string | null }

type Initial = {
  id: string
  title: string
  category_id: string | null
  location: string | null
  allow_guests: boolean
  capacity: number | null
  waitlist_enabled: boolean
  confirm_deadline: string | null
  join_policy: string
  status: string
  sched_start_date: string | null
  sched_end_date: string | null
  sched_time_min: number
  sched_time_max: number
  sched_slot_minutes: number
}

export default function EventForm({
  clubId,
  slug,
  categories,
  savedPlaces = [],
  recentPlaces = [],
  initial,
}: {
  clubId: string
  slug: string
  categories: Category[]
  savedPlaces?: Place[]
  recentPlaces?: Place[]
  initial?: Initial
}) {
  const edit = !!initial
  const [error, formAction, pending] = useActionState(
    edit ? updateEvent.bind(null, initial!.id, slug) : createEvent.bind(null, clubId, slug),
    null
  )
  const [title, setTitle] = useState(initial?.title ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  // still finding a time: the scheduling window can change. Once a slot's
  // picked, those fields are locked - editing them here wouldn't touch the
  // already-chosen chosen_start/chosen_end anyway.
  const showSchedWindow = !edit || initial?.status === 'scheduling'

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input id="title" name="title" label="Título" required placeholder="Noche de juegos" value={title} onChange={(e) => setTitle(e.target.value)} />

      <Dropdown
        name="category_id"
        label="Categoría"
        value={categoryId}
        onChange={setCategoryId}
        placeholder="Sin categoría"
        options={[
          { value: '', label: 'Sin categoría' },
          ...categories.map((c) => ({ value: c.id, label: `${c.emoji ? `${c.emoji} ` : ''}${c.name}` })),
        ]}
      />

      <LocationPicker name="location" label="Lugar (opcional)" defaultValue={initial?.location ?? ''} saved={savedPlaces} recent={recentPlaces} />

      {showSchedWindow && (
        <Fieldset legend="Buscar fecha" hint="La ventana de fechas y horas donde los miembros marcan cuándo pueden.">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input id="sched_start_date" name="sched_start_date" type="date" label="Desde" required defaultValue={initial?.sched_start_date ?? undefined} />
            </div>
            <div className="flex-1">
              <Input id="sched_end_date" name="sched_end_date" type="date" label="Hasta" required defaultValue={initial?.sched_end_date ?? undefined} />
            </div>
          </div>
          <div className="mt-2.5 flex gap-3">
            <div className="flex-1">
              <Select id="time_min" name="time_min" label="De" defaultValue={initial?.sched_time_min ?? 1140}>
                {HOURS.slice(0, 24).map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Select id="time_max" name="time_max" label="A" defaultValue={initial?.sched_time_max ?? 1380}>
                {HOURS.slice(1).map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Select id="slot_minutes" name="slot_minutes" label="Celdas" defaultValue={initial?.sched_slot_minutes ?? 60}>
                <option value={30}>30 min</option>
                <option value={60}>1 h</option>
              </Select>
            </div>
          </div>
        </Fieldset>
      )}

      <Fieldset legend="Opcional">
        <div className="flex flex-col gap-3 text-sm text-ink-700">
          <Checkbox name="allow_guests" label="Permitir invitados (+1)" defaultChecked={initial?.allow_guests} />
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
            <label className="flex items-center gap-2" htmlFor="capacity">
              Lugares máx.
              <input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                placeholder="∞"
                defaultValue={initial?.capacity ?? undefined}
                className="w-20 rounded-md border border-line-input bg-paper p-2 text-ink-900"
              />
            </label>
            <Checkbox name="waitlist_enabled" label="lista de espera" defaultChecked={initial?.waitlist_enabled} />
          </div>
          <Input
            id="confirm_deadline"
            name="confirm_deadline"
            type="datetime-local"
            label="Confirmar antes de"
            defaultValue={toDatetimeLocal(initial?.confirm_deadline ?? null)}
          />
          <Select id="join_policy" name="join_policy" label="Quién puede entrar con el enlace" defaultValue={initial?.join_policy ?? 'club_members_only'}>
            <option value="club_members_only">solo miembros del club</option>
            <option value="anyone_with_link">cualquiera con el enlace</option>
            <option value="invite_only">solo con invitación</option>
          </Select>
        </div>
      </Fieldset>

      {error && <p className="rounded-md bg-danger-bg px-3.5 py-3 text-sm text-danger">{error}</p>}

      <Button block display size="lg" disabled={pending || !title.trim()}>
        {pending ? 'Guardando…' : edit ? 'Guardar cambios' : 'Crear evento'}
      </Button>
      {!title.trim() && <p className="-mt-2 text-center text-xs text-ink-300">Dale un título primero.</p>}
    </form>
  )
}
