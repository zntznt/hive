import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import { createInvitation, updateJoinPolicy } from '@/app/actions'
import CopyButton from '@/components/copy-button'
import ResendButton from './resend-button'
import { timeAgo } from '@/lib/relative-time'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'

export default async function InvitesPage({ params }: { params: Promise<{ slug: string }> }) {
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
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="text-[22px] font-display font-bold leading-[1.2] text-ink-900">
          Invitar · {event.title}
        </h1>
        <Link href={`/e/${slug}`} className="tap shrink-0 text-sm font-semibold text-honey-700 underline">
          volver
        </Link>
      </header>

      <section className="mb-6">
        <SectionHeader>Enlace del evento</SectionHeader>
        <Card>
          <div className="flex items-center justify-between gap-2 rounded-md bg-cream-sunk px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-700">/e/{slug}</span>
            <CopyButton path={`/e/${slug}`} />
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Pégalo en el grupo de WhatsApp y los miembros del club entran directo.
          </p>
          <form
            action={updateJoinPolicy.bind(null, event.id, slug)}
            className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Select
                id="join_policy"
                name="join_policy"
                label="Quién puede entrar con él"
                defaultValue={event.join_policy}
              >
                <option value="club_members_only">Solo miembros del club</option>
                <option value="anyone_with_link">Cualquiera con el enlace</option>
                <option value="invite_only">Solo con invitación</option>
              </Select>
            </div>
            <Button variant="secondary" size="sm">
              Guardar
            </Button>
          </form>
        </Card>
      </section>

      <section className="mb-6">
        <SectionHeader>Invitación personal</SectionHeader>
        <Card className="border-dashed">
          <form
            action={createInvitation.bind(null, event.id, event.club_id, slug)}
            className="space-y-3"
          >
            <Input name="email" type="email" placeholder="correo" />
            <Input name="phone" placeholder="o WhatsApp (+52 …)" />
            <Button block type="submit">
              Crear invitación
            </Button>
            <p className="text-xs text-ink-500">
              Si dejas un correo, la invitación se manda sola por correo en cuanto la creas. Por
              WhatsApp todavía no mandamos el mensaje solos, copia el enlace personal que aparece
              abajo y pégalo tú en el chat. El enlace funciona igual por cualquiera de los dos
              caminos, en cuanto lo abran quedan agregados al club y al evento.
            </p>
          </form>
        </Card>
      </section>

      <section>
        <SectionHeader>Invitaciones · {(invitations ?? []).length}</SectionHeader>
        {(invitations ?? []).length === 0 ? (
          <EmptyState
            icon="envelope"
            title="Todavía no invitas a nadie"
            hint="Comparte el enlace del evento o manda una invitación personal."
          />
        ) : (
          <ul className="space-y-2">
            {(invitations ?? []).map((inv) => (
              <li key={inv.id}>
                <Card pad="sm" className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm text-ink-700">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{inv.email ?? inv.phone}</span>
                      {/* a declined invitation is an answer, not a silence.
                          Without this the organizer keeps resending to
                          someone who already said no. */}
                      {inv.claimed_by_user_id ? (
                        <Badge tone="active">aceptada</Badge>
                      ) : inv.declined_at ? (
                        <Badge tone="disabled">no puede</Badge>
                      ) : (
                        <Badge tone="pending">pendiente</Badge>
                      )}
                    </span>
                    <span className="text-[11.5px] text-ink-300">
                      {inv.declined_at ? `respondió ${timeAgo(inv.declined_at)}` : timeAgo(inv.created_at)}
                    </span>
                  </span>
                  {!inv.claimed_by_user_id && !inv.declined_at && (
                    <span className="flex flex-shrink-0 items-center gap-1.5">
                      <CopyButton path={`/i/${inv.token}`} label="Copiar" />
                      <ResendButton invitationId={inv.id} path={`/e/${slug}/invites`} />
                    </span>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
