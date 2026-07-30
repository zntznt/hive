'use client'

import { useState, useTransition } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Icon, type IconName } from '@/components/ui/Icon'
import { BrandMark } from '@/components/ui/BrandMark'
import { BeeLoader } from '@/components/ui/BeeLoader'
import { authOrigin } from '@/lib/site-url'
import { declineInvitation } from './actions'

type Props = {
  token: string
  clubName: string | null
  eventTitle: string | null
  inviter: string | null
  presetEmail: string | null
  phoneOnly: boolean
  when: string | null
  where: string | null
  going: number | null
  capacity: number | null
  declined: boolean
}

function whenLabel(iso: string) {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mexico_City',
  }).format(d)
  const hour = new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(d)
  return `${day[0].toUpperCase()}${day.slice(1)} · ${hour}`
}

function Fact({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} size={13} className="mt-[3px] shrink-0 text-honey-700" />
      <span className="text-[13.5px] leading-snug text-ink-700">{children}</span>
    </li>
  )
}

export default function InviteSignIn({
  token,
  clubName,
  eventTitle,
  inviter,
  presetEmail,
  phoneOnly,
  when,
  where,
  going,
  capacity,
  declined,
}: Props) {
  const [email, setEmail] = useState(presetEmail ?? '')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeclined, setDeclined] = useState(declined)
  const [saying, startSaying] = useTransition()

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError(null)
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${authOrigin()}/auth/callback?next=${encodeURIComponent(`/i/${token}`)}`,
        data: { invite_token: token },
      },
    })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  const say = (no: boolean) =>
    startSaying(async () => {
      await declineInvitation(token, !no)
      setDeclined(no)
    })

  const headerTitle = eventTitle ?? clubName ?? 'Hive'
  // A room with a number on it. Nobody decides on "te invitaron", they decide
  // on when, where and who else va, so those go above the sign-in instead of
  // behind it.
  const spots = capacity != null && going != null ? capacity - going : null

  return (
    <main className="mx-auto flex min-h-screen max-w-entry flex-col justify-center px-4 pb-10 pt-6">
      <div className="overflow-hidden rounded-2xl border border-line-card shadow-raised">
        <div
          className="border-b border-line-card px-[26px] pb-[22px] pt-7"
          style={{ backgroundImage: 'var(--honeycomb)', backgroundColor: 'var(--cream)' }}
        >
          <div className="mb-4">
            <BrandMark size="sm" variant="hex" showWordmark={false} />
          </div>
          <p className="eyebrow text-honey-700">Te invitaron</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight text-ink-900">{headerTitle}</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {eventTitle && clubName ? (
              <>
                {inviter ? `${inviter} te invitó` : 'Te invitaron'} con <b className="text-ink-700">{clubName}</b>.
              </>
            ) : inviter ? (
              `${inviter} te invitó a unirte.`
            ) : (
              'Te invitaron a unirte.'
            )}
          </p>

          {eventTitle && (
            <ul className="mt-4 flex flex-col gap-2 border-t border-line-divider pt-3.5">
              <Fact icon="calendar-day">
                {when ? whenLabel(when) : 'Todavía están buscando fecha entre todos.'}
              </Fact>
              <Fact icon="location-dot">{where || 'Falta definir el lugar.'}</Fact>
              <Fact icon="users">
                {going ? `${going} ${going === 1 ? 'persona va' : 'personas van'}` : 'Nadie ha confirmado todavía'}
                {capacity != null && (
                  <span className="text-ink-500">
                    {' · '}
                    {spots! > 0
                      ? `quedan ${spots} de ${capacity} lugares`
                      : `${capacity} lugares y ya está lleno, entrarías a la lista de espera`}
                  </span>
                )}
              </Fact>
            </ul>
          )}
        </div>

        <div className="bg-paper px-[26px] py-[26px]">
          {isDeclined ? (
            <div className="flex flex-col gap-3.5">
              <h2 className="font-display text-xl font-bold text-ink-900">Quedamos avisados</h2>
              <p className="text-sm text-ink-500">
                {inviter ? `${inviter} va a ver que no puedes.` : 'Quien te invitó va a ver que no puedes.'} Si cambias
                de opinión, este enlace sigue sirviendo.
              </p>
              <Button variant="secondary" block disabled={saying} onClick={() => say(false)}>
                {saying ? 'Un momento…' : 'Cambié de opinión, sí voy'}
              </Button>
            </div>
          ) : sent ? (
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-bold text-ink-900">Revisa tu correo</h2>
              <p className="text-sm text-ink-500">
                Te mandamos un enlace a <b className="text-honey-700">{email}</b>. Ábrelo en este mismo navegador.
              </p>
              <BeeLoader />
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-ink-700">
                Pon tu correo y te mandamos un enlace para entrar. Sin contraseñas.
              </p>
              <form onSubmit={send} className="flex flex-col gap-3.5">
                {phoneOnly && (
                  <p className="rounded-md bg-cream-sunk p-3 text-xs text-ink-500">
                    Te invitaron por WhatsApp. Por ahora se entra con correo, pon el tuyo y tu invitación queda ligada.
                  </p>
                )}
                <Input
                  id="email"
                  type="email"
                  required
                  label="Tu correo"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                />
                <Button display block size="lg" disabled={sending}>
                  {sending ? 'Enviando…' : 'Aceptar invitación'}
                </Button>
                {error && <p className="rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
                <p className="pt-0.5 text-center text-[11.5px] text-ink-300">
                  {clubName ? `Al aceptar te unes a «${clubName}».` : 'Sin contraseñas, sin formularios.'}
                </p>
              </form>

              {/* Saying no should not cost an account. An invitation nobody
                  answered looks exactly like one nobody opened, so the
                  organizer keeps chasing someone who already decided. */}
              <div className="mt-4 border-t border-line-divider pt-4 text-center">
                <button
                  type="button"
                  disabled={saying}
                  onClick={() => say(true)}
                  className="min-h-11 cursor-pointer px-3 text-[13px] font-bold text-ink-500 underline decoration-line-input underline-offset-4 disabled:opacity-50"
                >
                  {saying ? 'Avisando…' : 'No voy a poder'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
