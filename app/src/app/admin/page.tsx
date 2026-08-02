import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import type { Profile } from '@/lib/types'
import { setUserStatus, toggleAppAdmin } from '../actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Loud, FoldedEmpties } from '@/components/ui/Density'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { FaceStack } from '@/components/ui/FaceStack'
import { timeAgo } from '@/lib/relative-time'
import { type AvatarUser } from '@/components/ui/Avatar'
import { TemplateRow, TemplateSyncBar } from './template-row'
import OutboxLog, { type OutboxRow } from './outbox-log'
import { AppBar } from '@/components/ui/AppBar'
import { getT } from '@/lib/current-lang'
import type { StringKey } from '@/lib/lang'

// The account states, in Spanish. The badge printed the database enum, so an
// admin read "active" and "disabled" on a screen where everything else is
// Spanish. The outbox log next to it already had exactly this map.
// Keys, not copy: a module-level const freezes whichever language loaded the
// module first, which is trap three. Resolved at render below.
const STATUS_LABEL: Record<string, StringKey> = {
  active: 'admin.access.yes',
  disabled: 'admin.access.no',
  pending: 'account.wa.unverified',
}

// The platform panel: accounts and delivery, and nothing else.
//
// Club approvals used to live here, which put a club's own business on a
// screen two people in the whole app can open, and made those two the
// bottleneck for every category rename in every club. They decide on the club
// page now, by that club's admins, where the club page was already showing
// them anyway. This screen kept a copy and a "revisar en Admin" link pointing
// at it, so the same queue was drawn twice and only one of them was where the
// decision belonged.
//
// What is left is the three things only a platform admin owns. Each reports
// itself and opens in place rather than routing to a screen of its own: a
// panel used by two people does not need three routes. Delivery and templates
// go hot when something is actually wrong, so closed cannot hide a problem.

export default async function AdminPage() {
  const { t: tr, tf , lang } = await getT()
  const { supabase, profile } = await requireProfile()

  // Club managers used to land here for their approvals. Those moved to the
  // club page, so this is a platform screen now and says so by not opening.
  if (!profile.is_app_admin) redirect('/')

  const [{ data: userRows }, { data: outbox }, { data: tplRows }] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: false }),
    supabase
      .from('notification_outbox')
      .select('id, created_at, channel, template, status, sent_at, error, provider_ref, destination, users(display_name, email, phone_whatsapp)')
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.from('notification_templates').select('*').order('key'),
  ])

  const users = (userRows ?? []) as Profile[]

  // Counted across the whole outbox, not over the 40 rows the log renders. It
  // used to tally that slice and print it as a total, so an admin checking for
  // delivery failures read "fallos 0" while older failed rows sat unseen.
  const counts: Record<string, number> = { queued: 0, pending: 0, sent: 0, failed: 0, logged: 0 }
  await Promise.all(
    Object.keys(counts).map(async (status) => {
      const { count } = await supabase
        .from('notification_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
      counts[status] = count ?? 0
    })
  )

  const outboxRows = (outbox ?? []).map((row) => {
    const u = row.users as unknown as { display_name?: string; email?: string; phone_whatsapp?: string } | null
    return {
      id: row.id,
      created_at: row.created_at,
      channel: row.channel,
      template: row.template,
      status: row.status,
      sent_at: row.sent_at,
      error: row.error,
      provider_ref: row.provider_ref,
      // destination is where it actually went, which survives a member later
      // changing their number; the user lookup is the fallback for rows
      // written before that column existed. Push has no address: it fans out
      // to whichever browsers the member subscribed, so the person is the only
      // honest label for it.
      recipient:
        row.destination ??
        (row.channel === 'push' ? u?.display_name : row.channel === 'whatsapp' ? u?.phone_whatsapp : u?.email) ??
        u?.display_name ??
        tr('admin.noRecipient'),
    }
  }) as OutboxRow[]

  const templates = (tplRows ?? []) as {
    channel: string
    key: string
    lang: string
    subject: string | null
    body: string
    wa_status?: string | null
    wa_vars?: string[] | null
    wa_error?: string | null
  }[]
  const templateKeys = [...new Set(templates.map((t) => t.key))]
  const rejected = templates.filter((t) => t.wa_status === 'rejected').length

  // Oldest first: somebody who signed up on Monday has been waiting longer
  // than somebody who signed up this morning, and that is the whole ordering.
  const pendingUsers = users
    .filter((u) => u.status === 'pending')
    .sort((a, b) => Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? ''))
  const restUsers = users.filter((u) => u.status !== 'pending')
  const disabled = restUsers.filter((u) => u.status !== 'active').length
  const loudUser = pendingUsers[0] ?? null
  const restPending = pendingUsers.slice(1)

  // Whether the loud person is in a club yet, because "not in a club yet" is
  // the difference between a member somebody invited and a stranger who found
  // the sign-up form.
  const { data: loudClubs } = loudUser
    ? await supabase.from('club_members').select('club_id').eq('user_id', loudUser.id).limit(1)
    : { data: [] as { club_id: string }[] }

  return (
    <>
      <AppBar title={tr('admin.title')} backHref="/" />
      <main className="mx-auto w-full max-w-col px-4 pb-6">
        {loudUser ? (
          <div className="mb-[26px]">
            <Loud
              title={tf('admin.awaitingVerification', { name: loudUser.display_name })}
              body={
                <>
                  {tf('admin.signedUpAs', { ago: timeAgo(loudUser.created_at ?? '', lang), contact: loudUser.email ?? loudUser.phone_whatsapp ?? '' })}{' '}
                  {(loudClubs ?? []).length === 0 ? tr('admin.noClubYet') : tr('admin.alreadyClub')}
                </>
              }
              faces={[loudUser as unknown as AvatarUser]}
            >
              <div className="grid grid-cols-2 gap-2">
                <form action={setUserStatus.bind(null, loudUser.id, 'active')}>
                  <Button block display>
                    {tr('common.verify')}
                  </Button>
                </form>
                {/* Declining disables the account rather than deleting it: the
                    person may be a real member somebody mistyped, and a row
                    that can be reactivated is recoverable where a delete is
                    not. */}
                <form action={setUserStatus.bind(null, loudUser.id, 'disabled')}>
                  <Button block variant="secondary">
                    {tr('settle.reject')}
                  </Button>
                </form>
              </div>
            </Loud>
          </div>
        ) : (
          <div className="mb-[26px]">
            <FoldedEmpties>{tr('admin.none')}</FoldedEmpties>
          </div>
        )}

        {restPending.length > 0 && (
          <p className="mb-[18px] px-0.5 text-[12.5px] text-ink-300">
            {restPending.length === 1 ? tr('admin.morePendingOne') : tf('admin.morePending', { n: restPending.length })}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <CollapsibleSection
            label={tr('admin.users')}
            icon="users"
            summary={
              <span className="flex items-center gap-2">
                <FaceStack people={restUsers.slice(0, 4) as unknown as AvatarUser[]} size={20} max={4} />
                <span className="text-[12.5px] text-ink-300">
                  {users.length}
                  {disabled > 0 && tf('admin.noAccessN', { n: disabled })}
                </span>
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              {restPending.map((u) => (
                <Card key={u.id} pad="row" className="flex items-center justify-between border-honey-200 bg-honey-50">
                  <span className="min-w-0 text-sm text-ink-900">
                    {u.display_name}
                    <span className="ml-2 text-ink-500">{u.email ?? u.phone_whatsapp}</span>
                  </span>
                  <form action={setUserStatus.bind(null, u.id, 'active')}>
                    <Button size="sm">{tr('admin.verify')}</Button>
                  </form>
                </Card>
              ))}
              {restUsers.map((u) => (
                <Card key={u.id} pad="row" className="flex items-center justify-between text-sm">
                  <span className="flex flex-wrap items-center gap-1.5 text-ink-900">
                    {u.display_name}
                    <span className="text-ink-300">{u.email ?? u.phone_whatsapp}</span>
                    <Badge tone={u.status === 'active' ? 'active' : 'disabled'}>
                      {STATUS_LABEL[u.status] ? tr(STATUS_LABEL[u.status]) : u.status}
                    </Badge>
                    {u.is_app_admin && <Badge tone="admin">admin</Badge>}
                  </span>
                  {u.id !== profile.id && (
                    <span className="flex flex-shrink-0 items-center gap-2.5">
                      {u.status === 'active' ? (
                        <form action={setUserStatus.bind(null, u.id, 'disabled')}>
                          <button className="tap text-xs font-bold text-danger">{tr('admin.disable')}</button>
                        </form>
                      ) : (
                        <form action={setUserStatus.bind(null, u.id, 'active')}>
                          <button className="tap text-xs font-bold text-honey-700">{tr('admin.reactivate')}</button>
                        </form>
                      )}
                      <form action={toggleAppAdmin.bind(null, u.id, !u.is_app_admin)}>
                        <button className="tap text-xs font-bold text-ink-500">
                          {u.is_app_admin ? tr('admin.removeAdmin') : tr('admin.makeAdmin')}
                        </button>
                      </form>
                    </span>
                  )}
                </Card>
              ))}
            </div>
          </CollapsibleSection>

          {/* Hot on failures, because a closed row that says "0 fallos" and a
              closed row hiding twelve of them look identical. */}
          <CollapsibleSection
            label={tr('admin.delivery')}
            icon="paper-plane"
            tone={counts.failed > 0 ? 'hot' : undefined}
            summary={
              <span className={`text-[12.5px] ${counts.failed > 0 ? 'font-bold text-danger' : 'text-ink-300'}`}>
                {tf(counts.failed === 1 ? 'admin.queued1' : 'admin.queuedN', { n: counts.queued, f: counts.failed })}
              </span>
            }
          >
            <p className="text-sm text-ink-700">
              {tf('admin.outboxQueued', { n: counts.queued })} · {tf('admin.outboxPending', { n: counts.pending })} ·{' '}
              {tf('admin.outboxSent', { n: counts.sent })} · {tf('admin.outboxLogged', { n: counts.logged })} ·{' '}
              <span className={counts.failed ? 'font-bold text-danger' : ''}>{tf('admin.outboxFailed', { n: counts.failed })}</span>
            </p>
            <p className="mb-2 text-[11.5px] text-ink-300">
              {tr('admin.totalsNote')}
            </p>
            <OutboxLog rows={outboxRows} />
          </CollapsibleSection>

          <CollapsibleSection
            label={tr('admin.templates')}
            icon="envelope"
            tone={rejected > 0 ? 'hot' : undefined}
            summary={
              <span className={`text-[12.5px] ${rejected > 0 ? 'font-bold text-danger' : 'text-ink-300'}`}>
                {rejected > 0
                  ? tf(rejected === 1 ? 'admin.rejected1' : 'admin.rejectedN', { n: rejected })
                  : `${templateKeys.length}`}
              </span>
            }
          >
            <TemplateSyncBar />
            <div className="divide-y divide-line-divider overflow-hidden rounded-lg border border-line-card bg-paper">
              {templateKeys.map((key) => (
                <TemplateRow
                  key={key}
                  tplKey={key}
                  email={templates.find((t) => t.key === key && t.channel === 'email' && t.lang === 'es')}
                  emailEn={templates.find((t) => t.key === key && t.channel === 'email' && t.lang === 'en')}
                  whatsapp={templates.find((t) => t.key === key && t.channel === 'whatsapp' && t.lang === 'es')}
                />
              ))}
            </div>
          </CollapsibleSection>
        </div>
      </main>
    </>
  )
}
