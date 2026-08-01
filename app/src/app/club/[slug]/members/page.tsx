import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { type AvatarUser } from '@/components/ui/Avatar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import CopyButton from '@/components/copy-button'
import { AppBar } from '@/components/ui/AppBar'
import { MemberRow } from '../member-row'
import { InviteModal } from '../invite-modal'
import { updateClubJoinMode, revokeInvitation } from '@/app/actions'

// The roster, on its own screen.
//
// It used to be the tallest thing on the club page: one row per member, each
// with a role control and a remove button, then the pending invitations, then
// the join link and its policy select. All of it reference material, all of it
// in the way of the two questions the club page is actually asked ("what is
// next" and "where is it"), every single visit.
//
// Rule 3 says reference material leaves the page, and the club page keeps a
// door with the faces on it. This is where the door goes.

type AttendanceRow = {
  user_id: string
  category_id: string | null
  events_attended: number
  last_attended_at: string | null
  recorded_events: number
  estimated_events: number
}

export default async function ClubMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { supabase, profile } = await requireProfile()

  const { data: club } = await supabase
    .from('clubs')
    .select('id, slug, name, join_token, join_mode')
    .eq('slug', slug)
    .maybeSingle()
  if (!club) notFound()

  const [{ data: roster }, { data: att }] = await Promise.all([
    supabase
      .from('club_members')
      .select('user_id, role, joined_at, users(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
      .eq('club_id', club.id)
      .order('joined_at'),
    supabase.from('attendance_stats').select('*').eq('club_id', club.id),
  ])

  const me = (roster ?? []).find((m) => m.user_id === profile.id)
  if (!me && !profile.is_app_admin) notFound()
  const isAdmin = me?.role === 'admin' || profile.is_app_admin
  const isOrganizer = me?.role === 'organizer'
  const isManager = isAdmin || isOrganizer

  const attendance = (att ?? []) as AttendanceRow[]
  const attFor = (uid: string) => attendance.find((a) => a.user_id === uid && a.category_id === null)

  const { data: pendingInvites } = isAdmin
    ? await supabase
        .from('invitations')
        .select('*')
        .eq('club_id', club.id)
        .is('claimed_by_user_id', null)
        .order('created_at', { ascending: false })
    : { data: [] as { id: string; email: string | null; phone: string | null; declined_at: string | null }[] }

  return (
    <>
      <AppBar title="Miembros" backHref={`/club/${slug}`} />
      <main className="mx-auto w-full max-w-col px-4 pb-6 pt-5">
        <SectionHeader
          action={isManager ? <InviteModal clubId={club.id} slug={slug} clubName={club.name} isAdmin={isAdmin} /> : null}
        >
          {club.name} · {(roster ?? []).length}
        </SectionHeader>
        <div className="mb-[26px] overflow-hidden rounded-lg border border-line-card bg-paper">
          {(roster ?? []).map((m) => (
            <MemberRow
              key={m.user_id}
              clubId={club.id}
              slug={slug}
              userId={m.user_id}
              user={(m.users as unknown as AvatarUser | null) ?? { display_name: '·' }}
              role={m.role}
              isAdmin={isAdmin}
              isOrganizer={isOrganizer}
              isSelf={m.user_id === profile.id}
              lastAttendedAt={attFor(m.user_id)?.last_attended_at ?? null}
              eventsAttended={attFor(m.user_id)?.events_attended ?? 0}
              recordedEvents={attFor(m.user_id)?.recorded_events ?? 0}
              estimatedEvents={attFor(m.user_id)?.estimated_events ?? 0}
            />
          ))}
          {isAdmin &&
            (pendingInvites ?? []).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 border-t border-line-divider px-[13px] py-[11px] text-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <HexAvatar name={inv.email ?? inv.phone ?? '?'} size={28} />
                  <span className="min-w-0 truncate text-ink-500">{inv.email ?? inv.phone}</span>
                  {inv.declined_at ? <Badge tone="disabled">no puede</Badge> : <Badge>invitado</Badge>}
                </span>
                <form action={revokeInvitation.bind(null, inv.id, `/club/${slug}/members`)} className="flex-shrink-0">
                  <button className="tap text-[12.5px] font-bold text-ink-500">Revocar</button>
                </form>
              </div>
            ))}
        </div>

        {isAdmin && (
          <section className="mb-[26px]">
            <SectionHeader>Enlace para unirse</SectionHeader>
            <div className="flex items-center justify-between gap-2 rounded-md border border-line-card bg-paper px-[13px] py-[11px] text-sm">
              <span className="truncate text-ink-500">/c/{club.join_token}</span>
              <CopyButton path={`/c/${club.join_token}`} />
            </div>
            <form
              action={updateClubJoinMode.bind(null, club.id, `/club/${slug}/members`)}
              className="mt-2.5 flex flex-wrap items-center gap-2 text-sm"
            >
              <label htmlFor="join_mode" className="text-ink-700">
                Quién puede pedir entrar con el enlace
              </label>
              <select
                id="join_mode"
                name="join_mode"
                defaultValue={club.join_mode}
                className="rounded-md border border-line-input bg-paper p-1.5 text-xs"
              >
                <option value="invite_only">solo con invitación</option>
                <option value="anyone_with_link">cualquiera con el enlace (pide aprobación)</option>
              </select>
              <button className="tap min-h-11 rounded-md border border-line-input px-3 text-xs font-bold">Guardar</button>
            </form>
          </section>
        )}
      </main>
    </>
  )
}
