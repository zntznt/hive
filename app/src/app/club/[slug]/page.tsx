import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import type { EventRow } from '@/lib/types'
import { createCategory } from '@/app/actions'

type Category = { id: string; name: string; emoji: string | null }
type AttendanceRow = {
  user_id: string
  category_id: string | null
  events_attended: number
  last_attended_at: string
}

function fmt(d: string | null) {
  return d
    ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    : '·'
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ cat?: string }>
}) {
  const { supabase, profile } = await requireProfile()
  const { slug } = await params
  const { cat } = await searchParams

  const { data: club } = await supabase.from('clubs').select('*').eq('slug', slug).maybeSingle()
  if (!club) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-stone-600">
          Este club no existe o todavía no eres miembro. Pide el enlace de invitación.
        </p>
      </main>
    )
  }

  const [{ data: cats }, { data: evs }, { data: att }, { data: roster }] = await Promise.all([
    supabase.from('event_categories').select('*').eq('club_id', club.id).order('name'),
    supabase
      .from('events')
      .select('*')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false }),
    supabase.from('attendance_stats').select('*').eq('club_id', club.id),
    supabase
      .from('club_members')
      .select('user_id, role, joined_at, users(display_name)')
      .eq('club_id', club.id),
  ])

  const categories = (cats ?? []) as Category[]
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name
  const events = ((evs ?? []) as EventRow[]).filter((e) => !cat || e.category_id === cat)
  const upcoming = events.filter((e) => !['done', 'cancelled'].includes(e.status))
  const past = events.filter((e) => ['done', 'cancelled'].includes(e.status))

  const attendance = (att ?? []) as AttendanceRow[]
  const attFor = (uid: string) =>
    attendance.find((a) => a.user_id === uid && a.category_id === (cat ?? null))

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-stone-800">{club.name}</h1>
        <Link href="/" className="text-sm text-stone-500 underline">
          inicio
        </Link>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link
          href={`/club/${slug}`}
          className={`rounded-full border px-3 py-1 ${!cat ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-stone-300 text-stone-600'}`}
        >
          Todos
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/club/${slug}?cat=${c.id}`}
            className={`rounded-full border px-3 py-1 ${cat === c.id ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-stone-300 text-stone-600'}`}
          >
            {c.emoji ? `${c.emoji} ` : ''}
            {c.name}
          </Link>
        ))}
      </nav>

      <p className="mb-6">
        <Link
          href={`/club/${slug}/new-event`}
          className="inline-block rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          + Nuevo evento
        </Link>
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Próximos
        </h2>
        {upcoming.length === 0 && (
          <p className="text-sm text-stone-500">Nada en puerta por ahora.</p>
        )}
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.id}>
              <Link
                href={`/e/${e.slug}`}
                className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-amber-400"
              >
                <span className="font-medium text-stone-800">{e.title}</span>
                <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                  {catName(e.category_id) ?? 'sin categoría'}
                </span>
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  {e.status === 'scheduling'
                    ? 'buscando fecha'
                    : e.status === 'scheduled'
                      ? fmt(e.chosen_start)
                      : e.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Historial
        </h2>
        {past.length === 0 && <p className="text-sm text-stone-500">Aún sin historia.</p>}
        <ul className="space-y-2">
          {past.map((e) => (
            <li key={e.id}>
              <Link
                href={`/e/${e.slug}`}
                className="block rounded-xl border border-stone-200 bg-white p-3 text-sm hover:border-amber-400"
              >
                <span className="text-stone-800">{e.title}</span>
                <span className="ml-2 text-stone-400">
                  {catName(e.category_id) ?? ''} · {fmt(e.chosen_start)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {(roster ?? []).some((m) => m.user_id === profile.id && m.role === 'admin') && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
            Añadir categoría
          </h2>
          <form
            action={createCategory.bind(null, club.id, slug)}
            className="flex gap-2 rounded-xl border border-dashed border-stone-300 p-3"
          >
            <input
              name="emoji"
              placeholder="🎲"
              className="w-14 rounded-lg border border-stone-300 bg-white p-2 text-center text-sm outline-amber-500"
            />
            <input
              name="name"
              required
              placeholder="Juegos de mesa"
              className="flex-1 rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
            />
            <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white">
              Añadir
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Miembros {cat ? `· asistencia a ${catName(cat)}` : ''}
        </h2>
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {(roster ?? []).map((m) => {
            const u = m.users as unknown as { display_name: string } | null
            const a = attFor(m.user_id)
            return (
              <li key={m.user_id} className="flex items-center justify-between p-3 text-sm">
                <span className="text-stone-800">
                  {u?.display_name ?? '·'}
                  {m.role === 'admin' && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      admin
                    </span>
                  )}
                </span>
                <span className="text-stone-400">
                  {a
                    ? `última vez ${fmt(a.last_attended_at)} · ${a.events_attended} ev.`
                    : 'sin asistencias'}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
