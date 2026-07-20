import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { signOut } from '../actions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BugAvatar } from '@/components/ui/BugAvatar'
import { BeeLoader } from '@/components/ui/BeeLoader'

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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Card className="w-full text-center" elevation="raised">
        <div className="mb-4">
          <BugAvatar bug="bug" size={68} color="var(--honey-300)" />
        </div>
        <h1 className="font-display text-xl font-bold text-ink-900">Tu cuenta está por aprobarse</h1>
        <p className="mt-2.5 text-sm text-ink-500">
          {disabled
            ? 'Tu cuenta está desactivada. Contacta a quien administra Hive.'
            : 'Quien administra Hive tiene que aprobar tu cuenta. Te avisamos en cuanto esté lista; ya sabemos que llegaste.'}
        </p>
        {!disabled && (
          <div className="mt-5">
            <BeeLoader label="Zumbando en la fila…" />
          </div>
        )}
        <form action={signOut} className="mt-6">
          <Button variant="secondary">Cerrar sesión</Button>
        </form>
      </Card>
    </main>
  )
}
