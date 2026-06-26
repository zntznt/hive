import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { signOut } from '../actions'

export default async function PendingPage() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, status')
    .eq('id', user.id)
    .single()
  if (profile?.status === 'active') redirect('/')

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6 text-center">
      <h1 className="mb-2 text-xl font-semibold text-stone-800">
        Tu cuenta está por aprobarse
      </h1>
      <p className="mb-6 text-stone-500">
        {profile?.status === 'disabled'
          ? 'Tu cuenta está desactivada. Contacta a quien administra Hive.'
          : 'Quien administra Hive tiene que aprobar tu cuenta. Te avisamos en cuanto esté lista; ya sabemos que llegaste.'}
      </p>
      <form action={signOut}>
        <button className="rounded-xl border border-stone-300 px-4 py-2 text-sm text-stone-600">
          Cerrar sesión
        </button>
      </form>
    </main>
  )
}
