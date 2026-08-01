'use client'

import { useActionState, useState, useTransition } from 'react'
import { createEvent, updateEvent, createCategoryInline } from '@/app/actions'
import { Input, Select, Checkbox } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'
import { Segmented } from '@/components/ui/Segmented'
import { LocationPicker, type Place } from '@/components/ui/LocationPicker'
import { Icon, type IconName } from '@/components/ui/Icon'

// Read back in Mexico City, to match how the value was stored. getHours() runs
// in UTC while this renders on the server and in the visitor's zone after it
// hydrates, so the same input showed two different times.
function toDatetimeLocal(iso: string | null) {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
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

// One of the three extras, closed until you want it.
//
// These used to live under a card headed "Opcional": a checkbox, a number box
// labelled "Cupo máx.", another checkbox next to it, and a datetime field.
// Four controls in a row, none of them saying what happens if you use it, so
// the honest read of that card was "settings", and most people set none of
// them because none of them looked like they were for anything.
//
// So each one is a row that names the consequence rather than the field, and
// the control only appears once you have said yes to the sentence. What it
// says has to be what this app actually does: the deadline sends one reminder
// to whoever has not answered, it does not drop maybes or move a waitlist, so
// that is what the row says.
function Extra({
  icon,
  title,
  consequence,
  defaultOpen = false,
  children,
}: {
  icon: IconName
  title: string
  consequence: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-md border border-line-card bg-paper">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tap flex min-h-[58px] w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <Icon name={icon} size={15} className="flex-shrink-0 text-honey-700" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-ink-900">{title}</span>
          <span className="mt-0.5 block text-[12px] text-ink-500">{consequence}</span>
        </span>
        <Icon name={open ? 'minus' : 'plus'} size={12} className="flex-shrink-0 text-honey-700" />
      </button>
      {/* Kept mounted so a value you typed is still submitted after you fold
          the row back up. Closing a section is not the same as undoing it. */}
      <div className={open ? 'border-t border-line-divider px-3.5 py-3' : 'hidden'}>{children}</div>
    </div>
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

  // Categories were only creatable from the club page, so an organizer who
  // got here and found that "Cata de vinos" doesn't exist had to abandon a
  // half-filled form to go make it. NEW is a sentinel value on the picker
  // rather than a separate button, because the moment you want a new category
  // is the moment you open the list and it isn't there.
  const NEW = '__new__'
  const [cats, setCats] = useState(categories)
  const [newName, setNewName] = useState('')
  const [catNote, setCatNote] = useState<string | null>(null)
  const [addingCat, startAddCat] = useTransition()

  const addCategory = () =>
    startAddCat(async () => {
      const res = await createCategoryInline(clubId, slug, newName)
      if (!res.ok) {
        setCatNote(res.error)
        return
      }
      if ('category' in res && res.category) {
        setCats((c) => [...c, res.category])
        setCategoryId(res.category.id)
        setNewName('')
        setCatNote(null)
      } else {
        setCategoryId('')
        setNewName('')
        setCatNote('Se lo pedimos a la administración del club. Mientras, el evento se crea sin categoría.')
      }
    })

  // still finding a time: the scheduling window can change. Once a slot's
  // picked, those fields are locked - editing them here wouldn't touch the
  // already-chosen chosen_start/chosen_end anyway.
  const showSchedWindow = !edit || initial?.status === 'scheduling'

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input id="title" name="title" label="Título" required placeholder="Noche de juegos" value={title} onChange={(e) => setTitle(e.target.value)} />

      <div>
        <Dropdown
          name={categoryId === NEW ? 'category_new' : 'category_id'}
          label="Categoría"
          value={categoryId}
          onChange={(v) => {
            setCategoryId(v)
            setCatNote(null)
          }}
          placeholder="Sin categoría"
          options={[
            { value: '', label: 'Sin categoría' },
            ...cats.map((c) => ({ value: c.id, label: `${c.emoji ? `${c.emoji} ` : ''}${c.name}` })),
            { value: NEW, label: 'Nueva categoría…' },
          ]}
        />
        {categoryId === NEW && (
          <div className="mt-2 flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="new_category"
                label="Nombre de la categoría"
                value={newName}
                placeholder="Cata de vinos"
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={addingCat || !newName.trim()}
              onClick={addCategory}
            >
              {addingCat ? 'Creando…' : 'Crear'}
            </Button>
          </div>
        )}
        {catNote && <p className="mt-1.5 text-xs text-ink-500">{catNote}</p>}
      </div>

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
          </div>
          {/* was a <select> labelled "Celdas", which is a word about our grid,
              not about their evening. Two options hidden behind a tap, and
              nothing said what picking one did. */}
          <div className="mt-2.5">
            <Segmented
              name="slot_minutes"
              label="Qué tan fino se marca"
              defaultValue={initial?.sched_slot_minutes ?? 60}
              options={[
                { value: 30, label: 'Cada 30 min', note: 'Más preciso. La cuadrícula sale al doble de larga.' },
                { value: 60, label: 'Cada hora', note: 'Se marca rápido. Suficiente para la mayoría de los planes.' },
              ]}
            />
          </div>
        </Fieldset>
      )}

      <div className="flex flex-col gap-2">
        <p className="eyebrow px-0.5">Agrega si lo necesitas</p>

        <Extra
          icon="users"
          title="Un límite de cuántos caben"
          consequence="Con lista de espera cuando se llene"
          defaultOpen={initial?.capacity != null}
        >
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 text-sm text-ink-700">
            <label className="flex items-center gap-2" htmlFor="capacity">
              Cupo
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
        </Extra>

        <Extra
          icon="user-plus"
          title="Que traigan a alguien"
          consequence="Una pareja, un par de amigos"
          defaultOpen={!!initial?.allow_guests}
        >
          <div className="text-sm text-ink-700">
            <Checkbox name="allow_guests" label="Permitir invitados (+1)" defaultChecked={initial?.allow_guests} />
            <p className="mt-1.5 text-xs text-ink-300">
              Cada invitado ocupa un lugar del cupo, igual que un miembro.
            </p>
          </div>
        </Extra>

        <Extra
          icon="clock"
          title="Una fecha para confirmar"
          // What this app actually does at that moment. It does not drop
          // maybes and it does not move the waitlist, so it does not say so.
          consequence="A quien no haya contestado le llega un recordatorio"
          defaultOpen={!!initial?.confirm_deadline}
        >
          <Input
            id="confirm_deadline"
            name="confirm_deadline"
            type="datetime-local"
            label="Confirmar antes de"
            defaultValue={toDatetimeLocal(initial?.confirm_deadline ?? null)}
          />
          <p className="mt-1.5 text-xs text-ink-300">
            Un recordatorio, uno solo. Nadie pierde su lugar ni se cierra nada.
          </p>
        </Extra>

        <p className="mt-1 px-0.5 text-xs leading-relaxed text-ink-300">
          La mayoría de los eventos no necesitan ninguna. La lista de lo que hay que traer y las encuestas se agregan
          en el evento, una vez que existe y la gente ya puede apartar cosas.
        </p>
      </div>

      <Select id="join_policy" name="join_policy" label="Quién puede entrar con el enlace" defaultValue={initial?.join_policy ?? 'club_members_only'}>
        <option value="club_members_only">solo miembros del club</option>
        <option value="anyone_with_link">cualquiera con el enlace</option>
        <option value="invite_only">solo con invitación</option>
      </Select>

      {error && <p className="rounded-md bg-danger-bg px-3.5 py-3 text-sm text-danger">{error}</p>}

      {/* The button says what pressing it does. A new event with a scheduling
          window does not exist on a date yet, it exists as a question to the
          club, and "Crear evento" was hiding that. */}
      <Button block display size="lg" disabled={pending || !title.trim()}>
        {pending
          ? 'Guardando…'
          : edit
            ? 'Guardar cambios'
            : showSchedWindow
              ? 'Crear y pedir horarios'
              : 'Crear evento'}
      </Button>
      {!title.trim() && <p className="-mt-2 text-center text-xs text-ink-300">Dale un título primero.</p>}
    </form>
  )
}
