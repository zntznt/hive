import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { signOut } from '../actions'
import { Button } from '@/components/ui/Button'
import { BugAvatar } from '@/components/ui/BugAvatar'
import { BeeLoader } from '@/components/ui/BeeLoader'
import NudgeAdmins from './nudge-admins'

export default async function PendingPage() {
  const supabase = await supabaseServer()
  const { data: claimsData } = await supabase.auth.getClaims()
  const uid = claimsData?.claims?.sub
  if (!uid) redirect('/')
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, status')
    .eq('id', uid)
    .single()
  if (profile?.status === 'active') redirect('/')

  const disabled = profile?.status === 'disabled'

  // Who is actually reviewing, and how many people are ahead. A wait with a
  // name and a number on it is a queue; a spinner is a void.
  //
  // Both facts live in rows this account cannot read (users_select scopes a
  // non-admin to themselves plus their clubs, and someone waiting for approval
  // is in none), so they come from a definer function that returns those
  // facts and nothing else.
  const { data: queue } = disabled ? { data: null } : await supabase.rpc('pending_queue_status')
  const status = (queue?.[0] ?? null) as {
    reviewers: string[] | null
    ahead: number | null
    nudged_recently: boolean | null
  } | null
  const names = (status?.reviewers ?? []).slice(0, 3)
  const ahead = status?.ahead ?? null
  const nudgedRecently = status?.nudged_recently === true

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-entry text-center">
        <div className="mb-4.5 flex justify-center">
          {/* Two states share this screen and they are not the same news.
              Waiting for approval is a queue: honey, and it moves. Desactivada
              is not a place in line, so it does not get the queue's title, its
              color, or its loader. */}
          <BugAvatar bug="bug" size={68} color={disabled ? 'var(--cream-sunk)' : 'var(--honey-300)'} />
        </div>
        <h1 className="font-display text-xl font-bold text-ink-900">
          {disabled ? 'Tu cuenta está desactivada' : 'Estás en la fila'}
        </h1>
        <p className="mt-2.5 text-sm text-ink-500">
          {disabled
            ? 'Por ahora no puedes entrar a tus clubes ni a los eventos. Si crees que es un error, escríbele a quien administra Hive.'
            : 'Quien administra Hive tiene que aprobar tu cuenta. Te avisamos en cuanto esté lista; ya sabemos que llegaste.'}
        </p>
        {!disabled && (
          <>
            <p className="mt-2 text-sm text-ink-500">
              {names.length === 1
                ? `${names[0]} revisa las cuentas nuevas.`
                : names.length > 1
                  ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]} revisan las cuentas nuevas.`
                  : 'Quien administra revisa las cuentas nuevas.'}
              {ahead != null && ahead > 0
                ? ` Hay ${ahead} ${ahead === 1 ? 'persona' : 'personas'} antes que tú.`
                : ' Eres quien sigue.'}
            </p>
            <div className="mb-5.5 mt-5">
              <BeeLoader label="Zumbando en la fila…" />
            </div>
            <div className="mb-5 flex justify-center">
              <NudgeAdmins alreadyNudged={nudgedRecently} />
            </div>
          </>
        )}
        <form action={signOut} className={disabled ? 'mt-6' : undefined}>
          <Button variant="secondary">Cerrar sesión</Button>
        </form>
      </div>
    </main>
  )
}
