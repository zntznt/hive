import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import type { Profile } from '@/lib/types'
import { setUserStatus } from '../actions'

export default async function AdminPage() {
  const { supabase, profile } = await requireProfile()
  if (!profile.is_app_admin) redirect('/')

  const { data } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
  const users = (data ?? []) as Profile[]
  const pending = users.filter((u) => u.status === 'pending')
  const rest = users.filter((u) => u.status !== 'pending')

  const { data: outbox } = await supabase.from('notification_outbox').select('status')
  const counts = { queued: 0, sent: 0, failed: 0, logged: 0 } as Record<string, number>
  for (const row of outbox ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1

  return (
    <main className="mx-auto max-w-lg p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-stone-800">Administración</h1>
        <Link href="/" className="text-sm text-stone-500 underline">
          inicio
        </Link>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Pendientes de verificar ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-stone-500">Nadie espera en la puerta.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3"
              >
                <span className="text-sm text-stone-800">
                  {u.display_name}
                  <span className="ml-2 text-stone-500">{u.email ?? u.phone_whatsapp}</span>
                </span>
                <form action={setUserStatus.bind(null, u.id, 'active')}>
                  <button className="rounded-lg bg-amber-500 px-3 py-1 text-sm font-medium text-white">
                    Verificar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Usuarios ({rest.length})
        </h2>
        <ul className="space-y-2">
          {rest.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3 text-sm"
            >
              <span className="text-stone-800">
                {u.display_name}
                <span className="ml-2 text-stone-400">{u.email ?? u.phone_whatsapp}</span>
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                    u.status === 'active'
                      ? 'bg-stone-100 text-stone-600'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {u.status}
                </span>
                {u.is_app_admin && (
                  <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                    admin
                  </span>
                )}
              </span>
              {u.id !== profile.id &&
                (u.status === 'active' ? (
                  <form action={setUserStatus.bind(null, u.id, 'disabled')}>
                    <button className="text-xs text-red-700 underline">desactivar</button>
                  </form>
                ) : (
                  <form action={setUserStatus.bind(null, u.id, 'active')}>
                    <button className="text-xs text-amber-700 underline">reactivar</button>
                  </form>
                ))}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
          Mensajes salientes
        </h2>
        <p className="text-sm text-stone-600">
          en cola {counts.queued} · enviados {counts.sent} · registrados {counts.logged} ·{' '}
          <span className={counts.failed ? 'font-medium text-red-700' : ''}>
            fallos {counts.failed}
          </span>
        </p>
      </section>
    </main>
  )
}
