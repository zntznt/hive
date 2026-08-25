import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import { createInvitation } from '@/app/actions'
import CopyButton from '@/components/copy-button'
import ResendButton from './resend-button'
import { timeAgo } from '@/lib/relative-time'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AppBar } from '@/components/ui/AppBar'
import { JoinPolicyPicker } from './join-policy-picker'
import RevokeButton from './revoke-button'
import { getT } from '@/lib/current-lang'

export default async function InvitesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { t: tr, tf, lang } = await getT()
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
    <>
      {/* The AppBar, like new-event and edit either side of it. This screen
          hand-rolled a 22px h1 with an underlined "volver", so the sticky bar,
          the back chevron and the tappable subtitle disappeared for one screen
          in the middle of the flow. */}
      <AppBar title={tr('inv.link')} subtitle={event.title} subtitleHref={`/e/${slug}`} backHref={`/e/${slug}`} />
      <main className="mx-auto w-full max-w-col px-4 pb-6 pt-5">

      <section className="mb-[26px]">
        <SectionHeader>{tr('inv.link')}</SectionHeader>
        <Card>
          <div className="flex items-center justify-between gap-2 rounded-md bg-cream-sunk px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-700">/e/{slug}</span>
            <CopyButton path={`/e/${slug}`} />
          </div>
          <p className="mt-2 text-xs text-ink-500">
            {tr('inv.pasteInWa')}
          </p>
          <JoinPolicyPicker eventId={event.id} slug={slug} value={event.join_policy} />
        </Card>
      </section>

      <section className="mb-[26px]">
        <SectionHeader>{tr('inv.personal')}</SectionHeader>
        <Card className="border-dashed">
          <form
            action={createInvitation.bind(null, event.id, event.club_id, slug)}
            className="space-y-3"
          >
            {/* One field. Two made the organizer decide the channel before
                typing, and '@' is the only reliable tell anyway, which is the
                same rule sign-in already uses. */}
            <Input name="contact" label={tr('inv.contact')} placeholder={tr('inv.contact.ph')} />
            <Button block type="submit">
              {tr('inv.createOne')}
            </Button>
            <p className="text-xs text-ink-500">
              {tr('inv.howItWorks')}
            </p>
          </form>
        </Card>
      </section>

      <section>
        <SectionHeader>{tf('inv.headerN', { n: (invitations ?? []).length })}</SectionHeader>
        {(invitations ?? []).length === 0 ? (
          <EmptyState
            icon="envelope"
            title={tr('inv.none')}
            hint={tr('inv.none.hint')}
          />
        ) : (
          <ul className="space-y-2">
            {(invitations ?? []).map((inv) => (
              <li key={inv.id}>
                <Card pad="row" className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm text-ink-700">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{inv.email ?? inv.phone}</span>
                      {/* a declined invitation is an answer, not a silence.
                          Without this the organizer keeps resending to
                          someone who already said no. */}
                      {inv.claimed_by_user_id ? (
                        <Badge tone="active">{tr('inv.accepted')}</Badge>
                      ) : inv.declined_at ? (
                        <Badge tone="disabled">{tr('inv.no')}</Badge>
                      ) : inv.expires_at && new Date(inv.expires_at) < new Date() ? (
                        <Badge tone="neutral">{tr('inv.expired')}</Badge>
                      ) : (
                        <Badge tone="pending">{tr('inv.pending')}</Badge>
                      )}
                    </span>
                    <span className="text-[11.5px] text-ink-300">
                      {inv.declined_at
                        ? tf('inv.declinedAgo', { ago: timeAgo(inv.declined_at, lang) })
                        : inv.expires_at && new Date(inv.expires_at) < new Date()
                          ? tf('inv.expiredAgo', { ago: timeAgo(inv.expires_at, lang) })
                          : timeAgo(inv.created_at, lang)}
                    </span>
                  </span>
                  {/* a dead link can still be resent: that is what revives it */}
                  {!inv.claimed_by_user_id && !inv.declined_at && (
                    <span className="flex flex-shrink-0 items-center gap-1.5">
                      <CopyButton path={`/i/${inv.token}`} label={tr('common.copy')} />
                      <ResendButton invitationId={inv.id} path={`/e/${slug}/invites`} />
                      {/* Copy and Resend were the only two, so an invitation
                          sent to the wrong number could be sent again and
                          never taken back, though the club members screen
                          revokes the same rows and the action already exists. */}
                      <RevokeButton invitationId={inv.id} path={`/e/${slug}/invites`} label={tr('inv.revoke')} />
                    </span>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      </main>
    </>
  )
}
