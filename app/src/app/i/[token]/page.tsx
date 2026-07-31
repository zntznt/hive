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
  expired: boolean
  event_when: string | null
  event_where: string | null
  going: number | null
  capacity: number | null
  declined: boolean
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const supabase = await supabaseServer()
  const { token } = await params

  const { data } = await supabase.rpc('get_invitation_preview', { invite_token: token })
  const inv = (data?.[0] ?? null) as Preview | null
  if (!inv) {
    return (
      <main className="mx-auto flex min-h-screen max-w-entry flex-col justify-center px-4 pb-10 pt-6 text-center">
        <h1 className="mb-2 font-display text-xl font-bold text-ink-900">Invitación no encontrada</h1>
        <p className="text-ink-500">
          El enlace no es válido. Pide a quien organiza que te mande otro.
        </p>
      </main>
    )
  }

  // Deliberately does NOT claim here. Opening a link is not consent to join a
  // group of people, and a GET carries none of a server action's CSRF
  // protection, so this used to mean anyone could add a signed-in stranger to
  // their club just by getting them to follow a URL. The button does it.
  const { data: claimsData } = await supabase.auth.getClaims()
  const signedIn = !!claimsData?.claims?.sub

  return (
    <InviteSignIn
      token={token}
      clubName={inv.club_name}
      eventTitle={inv.event_title}
      inviter={inv.inviter}
      presetEmail={inv.email}
      phoneOnly={!inv.email && !!inv.phone}
      when={inv.event_when}
      where={inv.event_where}
      going={inv.going}
      capacity={inv.capacity}
      declined={inv.declined}
      expired={inv.expired}
      signedIn={signedIn}
    />
  )
}
