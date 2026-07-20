'use client'

import { useActionState } from 'react'
import { createEvent } from '@/app/actions'
import { Input, Select, Checkbox } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LocationPicker, type Place } from '@/components/ui/LocationPicker'

const HOURS = Array.from({ length: 25 }, (_, h) => ({
  value: h * 60,
  label: `${String(h).padStart(2, '0')}:00`,
}))

type Category = { id: string; name: string; emoji: string | null }

export default function EventForm({
  clubId,
  slug,
  categories,
  recentPlaces = [],
}: {
  clubId: string
  slug: string
  categories: Category[]
  recentPlaces?: Place[]
}) {
  const [error, formAction, pending] = useActionState(createEvent.bind(null, clubId, slug), null)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input id="title" name="title" label="Título" required placeholder="Noche de juegos" />

      <div className="flex gap-3">
        <div className="flex-1">
          <Select id="category_id" name="category_id" label="Categoría" defaultValue="">
            <option value="">sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ''}
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <LocationPicker name="location" label="Lugar (opcional)" recent={recentPlaces} />

      <Card pad="sm">
        <div className="mb-2 text-sm font-semibold text-ink-500">Buscar fecha</div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input id="sched_start_date" name="sched_start_date" type="date" label="Desde" required />
          </div>
          <div className="flex-1">
            <Input id="sched_end_date" name="sched_end_date" type="date" label="Hasta" required />
          </div>
        </div>
        <div className="mt-2.5 flex gap-3">
          <div className="flex-1">
            <Select id="time_min" name="time_min" label="De" defaultValue={1140}>
              {HOURS.slice(0, 24).map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Select id="time_max" name="time_max" label="A" defaultValue={1380}>
              {HOURS.slice(1).map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Select id="slot_minutes" name="slot_minutes" label="Celdas" defaultValue={60}>
              <option value={30}>30 min</option>
              <option value={60}>1 h</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card pad="sm">
        <div className="mb-2.5 text-sm font-semibold text-ink-500">Opcional</div>
        <div className="flex flex-col gap-3 text-sm text-ink-700">
          <Checkbox name="allow_guests" label="Permitir invitados (+1)" />
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
            <label className="flex items-center gap-2" htmlFor="capacity">
              Lugares máx.
              <input id="capacity" name="capacity" type="number" min={1} placeholder="∞" className="w-20 rounded-md border border-line-input bg-paper p-2 text-ink-900" />
            </label>
            <Checkbox name="waitlist_enabled" label="lista de espera" />
          </div>
          <Input id="confirm_deadline" name="confirm_deadline" type="datetime-local" label="Confirmar antes de" />
          <Select id="join_policy" name="join_policy" label="Quién puede entrar con el enlace" defaultValue="club_members_only">
            <option value="club_members_only">solo miembros del club</option>
            <option value="anyone_with_link">cualquiera con el enlace</option>
            <option value="invite_only">solo con invitación</option>
          </Select>
        </div>
      </Card>

      {error && <p className="rounded-md bg-danger-bg px-3.5 py-3 text-sm text-danger">{error}</p>}

      <Button block disabled={pending}>
        {pending ? 'Creando…' : 'Crear evento'}
      </Button>
    </form>
  )
}
