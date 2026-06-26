'use client'

import { useActionState } from 'react'
import { createEvent } from '@/app/actions'

const HOURS = Array.from({ length: 25 }, (_, h) => ({
  value: h * 60,
  label: `${String(h).padStart(2, '0')}:00`,
}))

type Category = { id: string; name: string; emoji: string | null }

export default function EventForm({
  clubId,
  slug,
  categories,
}: {
  clubId: string
  slug: string
  categories: Category[]
}) {
  const [error, formAction, pending] = useActionState(
    createEvent.bind(null, clubId, slug),
    null
  )

  const input = 'w-full rounded-xl border border-stone-300 bg-white p-3 outline-amber-500'
  const lbl = 'block text-sm text-stone-600'

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={lbl} htmlFor="title">Título</label>
        <input id="title" name="title" required placeholder="Noche de juegos" className={input} />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className={lbl} htmlFor="category_id">Categoría</label>
          <select id="category_id" name="category_id" className={input} defaultValue="">
            <option value="">sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ''}{c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className={lbl} htmlFor="location">Lugar (opcional)</label>
          <input id="location" name="location" placeholder="casa de…" className={input} />
        </div>
      </div>

      <fieldset className="rounded-xl border border-stone-200 bg-white p-3">
        <legend className="px-1 text-sm font-medium text-stone-500">Buscar fecha</legend>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={lbl} htmlFor="sched_start_date">Desde</label>
            <input id="sched_start_date" name="sched_start_date" type="date" required className={input} />
          </div>
          <div className="flex-1">
            <label className={lbl} htmlFor="sched_end_date">Hasta</label>
            <input id="sched_end_date" name="sched_end_date" type="date" required className={input} />
          </div>
        </div>
        <div className="mt-2 flex gap-3">
          <div className="flex-1">
            <label className={lbl} htmlFor="time_min">De</label>
            <select id="time_min" name="time_min" defaultValue={1140} className={input}>
              {HOURS.slice(0, 24).map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className={lbl} htmlFor="time_max">A</label>
            <select id="time_max" name="time_max" defaultValue={1380} className={input}>
              {HOURS.slice(1).map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className={lbl} htmlFor="slot_minutes">Celdas</label>
            <select id="slot_minutes" name="slot_minutes" defaultValue={60} className={input}>
              <option value={30}>30 min</option>
              <option value={60}>1 h</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700">
        <legend className="px-1 text-sm font-medium text-stone-500">Opcional</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="allow_guests" /> Permitir invitados (+1)
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor="capacity">Lugares máx.</label>
          <input id="capacity" name="capacity" type="number" min={1} placeholder="∞" className="w-20 rounded-lg border border-stone-300 p-2" />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="waitlist_enabled" /> lista de espera
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="confirm_deadline">Confirmar antes de</label>
          <input id="confirm_deadline" name="confirm_deadline" type="datetime-local" className="rounded-lg border border-stone-300 p-2" />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="join_policy">Enlace</label>
          <select id="join_policy" name="join_policy" defaultValue="club_members_only" className="rounded-lg border border-stone-300 p-2">
            <option value="club_members_only">solo miembros del club</option>
            <option value="anyone_with_link">cualquiera con el enlace</option>
            <option value="invite_only">solo con invitación</option>
          </select>
        </div>
      </fieldset>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-amber-500 p-3 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {pending ? 'Creando…' : 'Crear evento'}
      </button>
    </form>
  )
}
