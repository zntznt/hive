import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import { createInvitation, updateJoinPolicy } from '@/app/actions'
import CopyButton from '@/components/copy-button'

export default async function InvitesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { supabase, profile } = await requireProfile()
  const { slug } = await params

  const { data: event } = await supabase.from('events').select('*').eq('slug', slug).maybeSingle()
  if (!event) redirect('/')
  const { data: membership } = await supabase
    .from('event_members')
    .select('role')
    .eq('event_id', event.id)
    .eq('user_id', profile.id)
    .maybeSingle()
  const isOrganizer =
    event.organizer_user_id === profile.id || membership?.role === 'organizer' || profile.is_app_admin
  if (!isOrganizer) redirect(`/e/${slug}`)

  const { data: invitations } = await supabase
    .from('invitations')
    .select('*')
    .eq('event_id', event.id)
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-stone-800">Invitar · {event.title}</h1>
        <Link href={`/e/${slug}`} className="text-sm text-stone-500 underline">
          volver
        </Link>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Enlace del evento
        </h2>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm">
          <span className="truncate text-stone-600">/e/{slug}</span>
          <CopyButton path={`/e/${slug}`} />
        </div>
        <p className="mt-1 text-xs text-stone-400">
          Pégalo en el grupo de WhatsApp — los socios del club entran directos.
        </p>
        <form
          action={updateJoinPolicy.bind(null, event.id, slug)}
          className="mt-2 flex items-center gap-2 text-sm"
        >
          <label htmlFor="join_policy" className="text-stone-600">
            Quién puede entrar con él
          </label>
          <select
            id="join_policy"
            name="join_policy"
            defaultValue={event.join_policy}
            className="rounded-lg border border-stone-300 bg-white p-2"
          >
            <option value="club_members_only">solo socios del club</option>
            <option value="anyone_with_link">cualquiera con el enlace</option>
            <option value="invite_only">solo con invitación</option>
          </select>
          <button className="rounded-lg border border-stone-300 px-2 py-1 text-xs">Guardar</button>
        </form>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Invitación personal
        </h2>
        <form
          action={createInvitation.bind(null, event.id, event.club_id, slug)}
          className="space-y-2 rounded-xl border border-dashed border-stone-300 p-3"
        >
          <input
            name="email"
            type="email"
            placeholder="email"
            className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
          />
          <input
            name="phone"
            placeholder="o WhatsApp (+34 …)"
            className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
          />
          <button className="w-full rounded-lg bg-amber-500 p-2 text-sm font-medium text-white">
            Crear invitación
          </button>
          <p className="text-xs text-stone-400">
            Aún no enviamos mensajes automáticos: copia el enlace personal que aparece abajo y
            mándalo tú por WhatsApp o email. La invitación añade al club y al evento, y funciona
            aunque la persona entre luego con otro correo.
          </p>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Invitaciones ({(invitations ?? []).length})
        </h2>
        <ul className="space-y-2">
          {(invitations ?? []).map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-stone-700">
                {inv.email ?? inv.phone}
                {inv.claimed_by_user_id ? (
                  <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                    aceptada
                  </span>
                ) : (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                    pendiente
                  </span>
                )}
              </span>
              {!inv.claimed_by_user_id && <CopyButton path={`/i/${inv.token}`} label="Copiar invitación" />}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
