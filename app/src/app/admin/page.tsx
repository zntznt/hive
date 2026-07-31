import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import type { Profile } from '@/lib/types'
import { setUserStatus, toggleAppAdmin, decideChangeRequest, decideJoinRequest } from '../actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Loud, FoldedEmpties } from '@/components/ui/Density'
import { timeAgo } from '@/lib/relative-time'
import { EmptyState } from '@/components/ui/EmptyState'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { TemplateRow, TemplateSyncBar } from './template-row'
import OutboxLog, { type OutboxRow } from './outbox-log'
import { AppBar } from '@/components/ui/AppBar'

const CHANGE_KIND_LABEL: Record<string, string> = {
  about: 'Acerca de',
  category_add: 'Nueva categoría',
  category_edit: 'Editar categoría',
  category_delete: 'Eliminar categoría',
  banner: 'Portada',
  member_removal: 'Quitar miembro',
}

export default async function AdminPage() {
  const { supabase, profile } = await requireProfile()

  const { data: managed } = await supabase
    .from('club_members')
    .select('club_id, role')
    .eq('user_id', profile.id)
    .in('role', ['admin', 'organizer'])
  const managesAnyClub = (managed ?? []).length > 0
  if (!profile.is_app_admin && !managesAnyClub) redirect('/')

  // An organizer can SEE the queue (the select policies use is_club_manager)
  // but approve_join_request and approve_change_request both raise 'club admin
  // only'. Without this the page hands them buttons that throw into the error
  // boundary, which is every button on the screen.
  const canDecide = profile.is_app_admin || (managed ?? []).some((m) => m.role === 'admin')
  const notYours = (
    <span className="text-[12.5px] font-bold text-ink-500">Lo decide la administración del club</span>
  )

  const [{ data: changeReqs }, { data: joinReqs }] = await Promise.all([
    supabase
      .from('change_requests')
      .select('id, kind, payload, status, created_at, requested_by, clubs(name, slug), users:requested_by(display_name)')
      .eq('status', 'pending')
      .order('created_at'),
    supabase
      .from('club_join_requests')
      .select('id, status, created_at, user_id, clubs(name, slug), users:user_id(display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url)')
      .eq('status', 'pending')
      .order('created_at'),
  ])

  let users: Profile[] = []
  const counts: Record<string, number> = { queued: 0, pending: 0, sent: 0, failed: 0, logged: 0 }
  let outboxRows: OutboxRow[] = []
  let templates: {
    channel: string
    key: string
    subject: string | null
    body: string
    wa_status?: string | null
    wa_vars?: string[] | null
    wa_error?: string | null
  }[] = []
  if (profile.is_app_admin) {
    const [{ data: userRows }, { data: outbox }, { data: tplRows }] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase
        .from('notification_outbox')
        .select('id, created_at, channel, template, status, sent_at, error, provider_ref, destination, users(display_name, email, phone_whatsapp)')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.from('notification_templates').select('*').order('key'),
    ])
    users = (userRows ?? []) as Profile[]
    // Counted across the whole outbox, not over the 40 rows the log renders.
    // It used to tally that slice and print it as a total, so an admin
    // checking for delivery failures read "fallos 0" while older failed rows
    // sat in the table unseen.
    await Promise.all(
      Object.keys(counts).map(async (status) => {
        const { count } = await supabase
          .from('notification_outbox')
          .select('id', { count: 'exact', head: true })
          .eq('status', status)
        counts[status] = count ?? 0
      })
    )
    outboxRows = (outbox ?? []).map((row) => {
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
        // whichever address this row was actually aimed at
        // destination is where it actually went, which survives a member
        // later changing their number; the user lookup is the fallback for
        // rows written before that column existed
        recipient:
          row.destination ??
          (row.channel === 'whatsapp' ? u?.phone_whatsapp : u?.email) ??
          u?.display_name ??
          'sin destinatario',
      }
    }) as OutboxRow[]
    templates = tplRows ?? []
  }
  const pendingUsers = users.filter((u) => u.status === 'pending')
  const restUsers = users.filter((u) => u.status !== 'pending')
  const templateKeys = [...new Set(templates.map((t) => t.key))]

  const approvalsCount = (changeReqs ?? []).length + (joinReqs ?? []).length

  // Rule 1: the oldest thing waiting on a decision, answerable where you land.
  // A join request wins a tie because it is a person asking to be let in and
  // has been waiting the longest by definition of this queue's ordering.
  const loudJoin = (joinReqs ?? [])[0] ?? null
  const loudChange = !loudJoin ? ((changeReqs ?? [])[0] ?? null) : null
  const restJoins = loudJoin ? (joinReqs ?? []).slice(1) : (joinReqs ?? [])
  const restChanges = loudChange ? (changeReqs ?? []).slice(1) : (changeReqs ?? [])
  const restCount = restJoins.length + restChanges.length

  return (
    <>
      <AppBar title="Administración" backHref="/" />
      <main className="mx-auto max-w-col px-4 pb-6">

      {/* Rule 1. One decision, with the face of whoever is waiting on it,
          because a join request is a person asking to be let in and a queue
          of eight identical cards makes that abstract. */}
      {loudJoin &&
        (() => {
          const club = loudJoin.clubs as unknown as { name: string; slug: string } | null
          const requester = loudJoin.users as unknown as AvatarUser | null
          return (
            <div className="mb-[26px]">
              <Loud
                title={`${requester?.display_name ?? 'Alguien'} quiere entrar${club ? ` a ${club.name}` : ''}`}
                body={`Lo pidió ${timeAgo(loudJoin.created_at as string)}.`}
                faces={requester ? [requester] : undefined}
              >
                {canDecide ? (
                  <div className="grid grid-cols-2 gap-2">
                    <form action={decideJoinRequest.bind(null, loudJoin.id, club?.slug ?? '', true)}>
                      <Button block display>
                        Aprobar
                      </Button>
                    </form>
                    <form action={decideJoinRequest.bind(null, loudJoin.id, club?.slug ?? '', false)}>
                      <Button block variant="secondary">
                        Rechazar
                      </Button>
                    </form>
                  </div>
                ) : (
                  notYours
                )}
              </Loud>
            </div>
          )
        })()}

      {loudChange &&
        (() => {
          const club = loudChange.clubs as unknown as { name: string; slug: string } | null
          const requester = loudChange.users as unknown as { display_name: string } | null
          const payload = loudChange.payload as Record<string, string>
          const summary =
            payload?.name || payload?.description?.slice(0, 60) || CHANGE_KIND_LABEL[loudChange.kind] || loudChange.kind
          return (
            <div className="mb-[26px]">
              <Loud
                title={`${requester?.display_name ?? 'Alguien'} propone un cambio${club ? ` en ${club.name}` : ''}`}
                body={`${CHANGE_KIND_LABEL[loudChange.kind] ?? loudChange.kind} · ${summary}`}
              >
                {canDecide ? (
                  <div className="grid grid-cols-2 gap-2">
                    <form action={decideChangeRequest.bind(null, loudChange.id, club?.slug ?? '', true)}>
                      <Button block display>
                        Aprobar
                      </Button>
                    </form>
                    <form action={decideChangeRequest.bind(null, loudChange.id, club?.slug ?? '', false)}>
                      <Button block variant="secondary">
                        Rechazar
                      </Button>
                    </form>
                  </div>
                ) : (
                  notYours
                )}
              </Loud>
            </div>
          )
        })()}

      <section className={approvalsCount === 0 || restCount > 0 ? 'mb-[26px]' : undefined}>
        {approvalsCount === 0 ? (
          <>
            <SectionHeader>Aprobaciones</SectionHeader>
            <EmptyState icon="clipboard" title="Nada pendiente." hint="Las propuestas y solicitudes aparecen aquí." />
          </>
        ) : restCount === 0 ? null : (
          <>
            <SectionHeader>Y {restCount} más en la fila</SectionHeader>
          <div className="flex flex-col gap-2">
            {restChanges.map((r) => {
              const club = r.clubs as unknown as { name: string; slug: string } | null
              const requester = r.users as unknown as { display_name: string } | null
              const payload = r.payload as Record<string, string>
              const summary = payload?.name || payload?.description?.slice(0, 40) || CHANGE_KIND_LABEL[r.kind] || r.kind
              return (
                <Card key={r.id} pad="sm" className="border-honey-200 bg-honey-50">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-900">
                        <Badge tone="pending">{CHANGE_KIND_LABEL[r.kind] ?? r.kind}</Badge>
                        {requester?.display_name ?? '·'}
                        {club && (
                          <Link href={`/club/${club.slug}`}>
                            <Chip variant="sage">{club.name}</Chip>
                          </Link>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">{summary}</div>
                    </div>
                  </div>
                  {canDecide ? (
                    <div className="flex gap-2">
                      <form action={decideChangeRequest.bind(null, r.id, club?.slug ?? '', false)}>
                        <Button variant="secondary" size="sm">
                          Rechazar
                        </Button>
                      </form>
                      <form action={decideChangeRequest.bind(null, r.id, club?.slug ?? '', true)}>
                        <Button size="sm">Aprobar</Button>
                      </form>
                    </div>
                  ) : (
                    notYours
                  )}
                </Card>
              )
            })}
            {restJoins.map((r) => {
              const club = r.clubs as unknown as { name: string; slug: string } | null
              const requester = r.users as unknown as AvatarUser | null
              return (
                <Card key={r.id} pad="sm" className="border-honey-200 bg-honey-50">
                  <div className="mb-2 flex items-center gap-2.5">
                    <UserAvatar user={requester ?? { display_name: '·' }} size={28} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-900">
                        <Badge tone="pending">Solicitud de unión</Badge>
                        {requester?.display_name ?? '·'}
                        {club && (
                          <Link href={`/club/${club.slug}`}>
                            <Chip variant="sage">{club.name}</Chip>
                          </Link>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">quiere unirse al club</div>
                    </div>
                  </div>
                  {canDecide ? (
                    <div className="flex gap-2">
                      <form action={decideJoinRequest.bind(null, r.id, club?.slug ?? '', false)}>
                        <Button variant="secondary" size="sm">
                          Rechazar
                        </Button>
                      </form>
                      <form action={decideJoinRequest.bind(null, r.id, club?.slug ?? '', true)}>
                        <Button size="sm">Aprobar</Button>
                      </form>
                    </div>
                  ) : (
                    notYours
                  )}
                </Card>
              )
            })}
          </div>
          </>
        )}
      </section>

      {profile.is_app_admin && (
        <>
          {/* Rule 6: an empty queue is one line, not a header plus a card
              plus a sentence saying there is nothing in it. */}
          {pendingUsers.length === 0 ? (
            <div className="mb-[26px]">
              <FoldedEmpties>Nadie espera a que le verifiquen la cuenta.</FoldedEmpties>
            </div>
          ) : (
          <section className="mb-[26px]">
            <SectionHeader>Pendientes de verificar ({pendingUsers.length})</SectionHeader>
            {(
              <div className="flex flex-col gap-2">
                {pendingUsers.map((u) => (
                  <Card key={u.id} pad="sm" className="border-honey-200 bg-honey-50 flex items-center justify-between">
                    <span className="text-sm text-ink-900">
                      {u.display_name}
                      <span className="ml-2 text-ink-500">{u.email ?? u.phone_whatsapp}</span>
                    </span>
                    <form action={setUserStatus.bind(null, u.id, 'active')}>
                      <Button size="sm">Verificar</Button>
                    </form>
                  </Card>
                ))}
              </div>
            )}
          </section>
          )}

          <section className="mb-[26px]">
            <SectionHeader>Usuarios ({restUsers.length})</SectionHeader>
            <div className="flex flex-col gap-2">
              {restUsers.map((u) => (
                <Card key={u.id} pad="sm" className="flex items-center justify-between text-sm">
                  <span className="flex flex-wrap items-center gap-1.5 text-ink-900">
                    {u.display_name}
                    <span className="text-ink-300">{u.email ?? u.phone_whatsapp}</span>
                    <Badge tone={u.status === 'active' ? 'active' : 'disabled'}>{u.status}</Badge>
                    {u.is_app_admin && <Badge tone="admin">admin</Badge>}
                  </span>
                  {u.id !== profile.id && (
                    <span className="flex flex-shrink-0 items-center gap-2.5">
                      {u.status === 'active' ? (
                        <form action={setUserStatus.bind(null, u.id, 'disabled')}>
                          <button className="tap text-xs font-bold text-danger">desactivar</button>
                        </form>
                      ) : (
                        <form action={setUserStatus.bind(null, u.id, 'active')}>
                          <button className="tap text-xs font-bold text-honey-700">reactivar</button>
                        </form>
                      )}
                      <form action={toggleAppAdmin.bind(null, u.id, !u.is_app_admin)}>
                        <button className="tap text-xs font-bold text-ink-500">{u.is_app_admin ? 'quitar admin' : 'hacer admin'}</button>
                      </form>
                    </span>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <section className="mb-[26px]">
            <SectionHeader>Mensajes salientes</SectionHeader>
            <p className="text-sm text-ink-700">
              en cola {counts.queued} · esperando confirmación {counts.pending} · enviados {counts.sent} ·{' '}
              registrados {counts.logged} ·{' '}
              <span className={counts.failed ? 'font-bold text-danger' : ''}>fallos {counts.failed}</span>
            </p>
            <p className="mb-2 text-[11.5px] text-ink-300">
              Los totales son de toda la bandeja. Abajo, los 40 más recientes.
            </p>
            <OutboxLog rows={outboxRows} />
          </section>

          <section>
            <SectionHeader>Plantillas de notificación</SectionHeader>
            <TemplateSyncBar />
            <div className="divide-y divide-line-divider overflow-hidden rounded-lg border border-line-card bg-paper">
              {templateKeys.map((key) => (
                <TemplateRow
                  key={key}
                  tplKey={key}
                  email={templates.find((t) => t.key === key && t.channel === 'email')}
                  whatsapp={templates.find((t) => t.key === key && t.channel === 'whatsapp')}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </main>
    </>
  )
}
