import { supabaseServer } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { BrandMark } from '@/components/ui/BrandMark'
import ClubJoinSignIn from './club-join-signin'
import ClubJoinRequest from './club-join-request'
import { getT } from '@/lib/current-lang'

type Preview = {
  club_name: string | null
  club_slug: string | null
  join_mode: 'invite_only' | 'anyone_with_link' | null
}

export default async function ClubJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { t: tr } = await getT()
  const supabase = await supabaseServer()
  const { token } = await params

  const { data } = await supabase.rpc('get_club_join_preview', { jtoken: token })
  const preview = (data?.[0] ?? null) as Preview | null

  if (!preview || !preview.club_name) {
    return (
      <main className="mx-auto flex min-h-screen max-w-entry flex-col justify-center px-4 pb-10 pt-6 text-center">
        <h1 className="mb-2 font-display text-xl font-bold text-ink-900">{tr('club.notFound')}</h1>
        <p className="text-ink-500">
          El enlace no es válido. Pide a quien administra el club que te mande otro.
        </p>
      </main>
    )
  }

  if (preview.join_mode !== 'anyone_with_link') {
    return (
      <main className="mx-auto flex min-h-screen max-w-entry flex-col justify-center px-4 pb-10 pt-6">
        <Card honeycomb className="text-center">
          <div className="mb-4 flex justify-center">
            <BrandMark size="sm" showWordmark={false} />
          </div>
          <p className="eyebrow mb-1 text-honey-700">{tr('club.private')}</p>
          <h1 className="mb-2 font-display text-xl font-bold text-ink-900">«{preview.club_name}»</h1>
          <p className="text-ink-500">
            Este club solo se une por invitación directa. Pide a alguien miembro que te invite.
          </p>
        </Card>
      </main>
    )
  }

  const { data: claimsData } = await supabase.auth.getClaims()

  if (claimsData?.claims?.sub) {
    return <ClubJoinRequest token={token} clubName={preview.club_name} />
  }

  return <ClubJoinSignIn token={token} clubName={preview.club_name} />
}
