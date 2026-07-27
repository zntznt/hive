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
import { EmptyState } from '@/components/ui/EmptyState'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { TemplateRow, TemplateSyncBar } from './template-row'
import OutboxLog, { type OutboxRow } from './outbox-log'

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
    .select('club_id')
    .eq('user_id', profile.id)
    .in('role', ['admin', 'organizer'])
  const managesAnyClub = (managed ?? []).length > 0
  if (!profile.is_app_admin && !managesAnyClub) redirect('/')

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
        .select('id, created_at, channel, template, status, sent_at, error, provider_ref, users(display_name, email, phone_whatsapp)')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.from('notification_templates').select('*').order('key'),
    ])
    users = (userRows ?? []) as Profile[]
    for (const row of outbox ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1
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
        recipient:
          (row.channel === 'whatsapp' ? u?.phone_whatsapp : u?.email) ?? u?.display_name ?? 'sin destinatario',
      }
    }) as OutboxRow[]
    templates = tplRows ?? []
  }
  const pendingUsers = users.filter((u) => u.status === 'pending')
  const restUsers = users.filter((u) => u.status !== 'pending')
  const templateKeys = [...new Set(templates.map((t) => t.key))]

  const approvalsCount = (changeReqs ?? []).length + (joinReqs ?? []).length

  return (
    <main className="mx-auto max-w-lg p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-xl font-bold text-ink-900">Administración</h1>
        <Link href="/" className="text-sm text-ink-500">
          inicio
        </Link>
      </header>

      <section className="mb-8">
        <SectionHeader>Aprobaciones · {approvalsCount}</SectionHeader>
        {approvalsCount === 0 ? (
          <EmptyState icon="clipboard" title="Nada pendiente." hint="Las propuestas y solicitudes aparecen aquí." />
        ) : (
          <div className="flex flex-col gap-2">
            {(changeReqs ?? []).map((r) => {
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
                </Card>
              )
            })}
            {(joinReqs ?? []).map((r) => {
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
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {profile.is_app_admin && (
        <>
          <section className="mb-8">
            <SectionHeader>Pendientes de verificar ({pendingUsers.length})</SectionHeader>
            {pendingUsers.length === 0 ? (
              <p className="text-sm text-ink-500">Nadie espera en la puerta.</p>
            ) : (
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

          <section className="mb-8">
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
                          <button className="text-xs font-bold text-danger">desactivar</button>
                        </form>
                      ) : (
                        <form action={setUserStatus.bind(null, u.id, 'active')}>
                          <button className="text-xs font-bold text-honey-700">reactivar</button>
                        </form>
                      )}
                      <form action={toggleAppAdmin.bind(null, u.id, !u.is_app_admin)}>
                        <button className="text-xs font-bold text-ink-500">{u.is_app_admin ? 'quitar admin' : 'hacer admin'}</button>
                      </form>
                    </span>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <SectionHeader>Mensajes salientes</SectionHeader>
            <p className="text-sm text-ink-700">
              en cola {counts.queued} · esperando confirmación {counts.pending} · enviados {counts.sent} ·{' '}
              registrados {counts.logged} ·{' '}
              <span className={counts.failed ? 'font-bold text-danger' : ''}>fallos {counts.failed}</span>
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
  )
}
