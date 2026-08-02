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

// A panel is a flat 16px. `pad="sm"` was a third value between a row's
// 12px 14px and a panel's 16px, and that difference is the whole signal that
// tells you whether you are looking at a line in a list or an object in its
// own right.
function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="eyebrow mb-1">{legend}</div>
      {hint && <div className="mb-3 text-xs text-ink-300">{hint}</div>}
      <div className={hint ? undefined : 'mt-3'}>{children}</div>
    </Card>
  )
}

// How many each member may bring. A stepper because the answer is a number:
// people bring a partner and two friends, and "+1" only ever described one of
// those. The database counts guests per host and always has, so this is the
// piece catching up with the rest of the stack rather than a new idea.
//
// Five is the ceiling. Past that it stops being "bring somebody" and becomes a
// second invitation list, which belongs to the club and not to one evening.
function GuestStepper({ defaultValue }: { defaultValue: number }) {
  const [n, setN] = useState(Math.min(5, Math.max(1, defaultValue)))
  return (
    <div className="text-sm text-ink-700">
      <input type="hidden" name="max_guests_per_member" value={String(n)} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>cada miembro puede traer</span>
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setN((v) => Math.max(1, v - 1))}
            disabled={n <= 1}
            aria-label="uno menos"
            className="grid h-11 w-11 place-items-center rounded-md border border-line-input bg-paper text-ink-700 disabled:opacity-40"
          >
            <Icon name="minus" size={12} />
          </button>
          <span aria-live="polite" className="min-w-[26px] text-center text-[15.5px] font-extrabold text-ink-900">
            {n}
          </span>
          <button
            type="button"
            onClick={() => setN((v) => Math.min(5, v + 1))}
            disabled={n >= 5}
            aria-label="uno más"
            className="grid h-11 w-11 place-items-center rounded-md border border-line-input bg-paper text-ink-700 disabled:opacity-40"
          >
            <Icon name="plus" size={12} />
          </button>
        </span>
      </div>
      <p className="mt-1.5 text-xs text-ink-300">Cada invitado ocupa un lugar del cupo, igual que un miembro.</p>
    </div>
  )
}

// One of the three extras: an offer until you take it, a fieldset once you do.
//
// These used to live under a card headed "Opcional": a checkbox, a number box
// labelled "Cupo máx.", another checkbox next to it, and a datetime field.
// Four controls in a row, none of them saying what happens if you use it, so
// the honest read of that card was "settings", and most people set none of
// them because none of them looked like they were for anything.
//
// So each one is a row that names the consequence rather than the field. The
// first pass made that row a disclosure, which is the wrong verb: a collapsed
// section says "there is a thing here you are not looking at", and half of
// these are then invisibly switched on. Adding one is a decision, so it turns
// into a plain visible fieldset with a Quitar, and closing it is not a way of
// hiding a value, it is a way of removing it.
//
// What each row says has to be what this app actually does: the deadline sends
// one reminder to whoever has not answered, it does not drop maybes or move a
// waitlist, so that is what its row says.
function Extra({
  icon,
  title,
  consequence,
  added,
  onAdd,
  onRemove,
  children,
}: {
  icon: IconName
  title: string
  consequence: string
  added: boolean
  onAdd: () => void
  onRemove: () => void
  children: React.ReactNode
}) {
  if (!added) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="tap flex min-h-[58px] w-full items-center gap-2.5 rounded-md border border-line-card bg-paper px-3.5 py-2.5 text-left"
      >
        <Icon name={icon} size={15} className="flex-shrink-0 text-honey-700" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-ink-900">{title}</span>
          <span className="mt-0.5 block text-[12px] text-ink-500">{consequence}</span>
        </span>
        <Icon name="plus" size={12} className="flex-shrink-0 text-honey-700" />
      </button>
    )
  }
  return (
    <div className="rounded-md border border-line-card bg-paper px-3.5 py-3">
      <div className="mb-2.5 flex items-center gap-2.5">
        <Icon name={icon} size={15} className="flex-shrink-0 text-honey-700" />
        <span className="min-w-0 flex-1 text-[13.5px] font-bold text-ink-900">{title}</span>
        <button type="button" onClick={onRemove} className="tap flex-shrink-0 text-[12.5px] font-bold text-ink-500">
          Quitar
        </button>
      </div>
      {children}
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
  lat: number | null
  lng: number | null
  allow_guests: boolean
  maxGuestsPerMember: number | null
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

  // Which of the three extras this event has. On an edit all three arrive
  // added, whatever their values: you came here to change the event, and
  // hunting for the capacity field behind a plus sign is not that. On a new
  // event none are, because most events need none of them.
  // Removing one really removes it: the fields unmount, so nothing is
  // submitted for them and the action writes null, which is what "quitar"
  // has to mean on an event that already had a capacity.
  const [cap, setCap] = useState(edit)
  const [guests, setGuests] = useState(edit)
  const [deadline, setDeadline] = useState(edit)

  return (
    <form action={formAction} className="flex flex-col gap-[18px]">
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

      <LocationPicker
        name="location"
        label="Lugar (opcional)"
        defaultValue={initial?.location ?? ''}
        defaultPoint={initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null}
        saved={savedPlaces}
        recent={recentPlaces}
      />

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
          added={cap}
          onAdd={() => setCap(true)}
          onRemove={() => setCap(false)}
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
          {/* The reason these two controls are one block. Without it the
              waitlist reads as an unrelated setting that happens to be
              nearby. */}
          <p className="mt-2 text-xs text-ink-300">Sin cupo el evento nunca se llena, y nadie espera.</p>
        </Extra>

        <Extra
          icon="user-plus"
          title="Que traigan a alguien"
          consequence="Una pareja, un par de amigos"
          added={guests}
          onAdd={() => setGuests(true)}
          onRemove={() => setGuests(false)}
        >
          {/* A stepper, not a checkbox. The row above promises "una pareja, un
              par de amigos" - two different people - and a boolean permits
              exactly one, so the control contradicted its own offer. The rest
              of the stack already counted guests per host; this was the only
              piece that thought the answer was yes or no. */}
          <GuestStepper defaultValue={initial?.maxGuestsPerMember ?? 1} />
        </Extra>

        <Extra
          icon="clock"
          title="Una fecha para confirmar"
          // What this app actually does at that moment. It does not drop
          // maybes and it does not move the waitlist, so it does not say so.
          consequence="A quien no haya contestado le llega un recordatorio"
          added={deadline}
          onAdd={() => setDeadline(true)}
          onRemove={() => setDeadline(false)}
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
