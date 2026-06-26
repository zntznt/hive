import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import SignIn from './signin'
import { signOut } from './actions'

export default async function Home() {
  const supabase = await supabaseServer()
  // getClaims() verifies locally (ES256), no Auth round trip
  const { data: claimsData } = await supabase.auth.getClaims()
  const uid = claimsData?.claims?.sub
  if (!uid) return <SignIn />

  const { data: profile } = await supabase.from('users').select('*').eq('id', uid).single()
  if (!profile || profile.status !== 'active') redirect('/pending')

  // filter to OWN memberships explicitly: RLS implicitly does this for regular
  // members, but the app admin can see every membership row of every club
  const { data: memberships } = await supabase
    .from('club_members')
    .select('club_id, clubs(slug, name)')
    .eq('user_id', uid)

  const clubs = Array.from(
    new Map(
      (memberships ?? [])
        .map((m) => m.clubs as unknown as { slug: string; name: string } | null)
        .filter((c): c is { slug: string; name: string } => !!c)
        .map((c) => [c.slug, c])
    ).values()
  )

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-800">
          <span className="text-amber-600">Hive</span> · hola, {profile.display_name}
        </h1>
        <form action={signOut}>
          <button className="text-sm text-stone-500 underline">salir</button>
        </form>
      </header>

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-400">
        Tus clubs
      </h2>
      {clubs.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-stone-600">
          Todavía no estás en ningún club. Pide a quien organiza que te invite.
        </p>
      ) : (
        <ul className="space-y-2">
          {clubs.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/club/${c.slug}`}
                className="block rounded-xl border border-stone-200 bg-white p-4 font-medium text-stone-800 hover:border-amber-400"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm">
        <Link href="/club/new" className="text-amber-700 underline">
          + Crear un club
        </Link>
      </p>

      {profile.is_app_admin && (
        <p className="mt-8 text-sm">
          <Link href="/admin" className="text-amber-700 underline">
            Panel de administración
          </Link>
        </p>
      )}
    </main>
  )
}
