import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import InviteSignIn from './invite-signin'

type Preview = {
  club_name: string | null
  club_slug: string | null
  event_title: string | null
  event_slug: string | null
  email: string | null
  phone: string | null
  inviter: string | null
  claimed: boolean
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const supabase = await supabaseServer()
  const { token } = await params

  const { data } = await supabase.rpc('get_invitation_preview', { invite_token: token })
  const inv = (data?.[0] ?? null) as Preview | null
  if (!inv) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6 text-center">
        <h1 className="mb-2 text-xl font-semibold text-stone-800">Invitación no encontrada</h1>
        <p className="text-stone-500">
          El enlace no es válido. Pide a quien organiza que te mande otro.
        </p>
      </main>
    )
  }

  const { data: claimsData } = await supabase.auth.getClaims()

  if (claimsData?.claims?.sub) {
    const { data: target, error } = await supabase.rpc('claim_invitation', {
      invite_token: token,
    })
    if (error) {
      return (
        <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6 text-center">
          <h1 className="mb-2 text-xl font-semibold text-stone-800">No se pudo usar la invitación</h1>
          <p className="text-stone-500">{error.message}</p>
        </main>
      )
    }
    const t = target as { event_slug: string | null; club_slug: string | null }
    redirect(t.event_slug ? `/e/${t.event_slug}` : t.club_slug ? `/club/${t.club_slug}` : '/')
  }

  const what = inv.event_title ?? inv.club_name ?? 'Hive'
  return (
    <InviteSignIn
      token={token}
      title={what}
      inviter={inv.inviter}
      clubName={inv.event_title ? inv.club_name : null}
      presetEmail={inv.email}
      phoneOnly={!inv.email && !!inv.phone}
    />
  )
}
