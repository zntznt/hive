'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BrandMark } from '@/components/ui/BrandMark'
import { BeeLoader } from '@/components/ui/BeeLoader'

type Props = {
  token: string
  clubName: string | null
  eventTitle: string | null
  inviter: string | null
  presetEmail: string | null
  phoneOnly: boolean
}

export default function InviteSignIn({ token, clubName, eventTitle, inviter, presetEmail, phoneOnly }: Props) {
  const [email, setEmail] = useState(presetEmail ?? '')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError(null)
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(`/i/${token}`)}`,
        data: { invite_token: token },
      },
    })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  const headerTitle = clubName ?? eventTitle ?? 'Hive'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="overflow-hidden rounded-2xl border border-line-card shadow-raised">
        <div className="border-b border-line-card px-[26px] pb-[22px] pt-7" style={{ backgroundImage: 'var(--honeycomb)', backgroundColor: 'var(--cream)' }}>
          <div className="mb-4">
            <BrandMark size="sm" variant="hex" showWordmark={false} />
          </div>
          <p className="eyebrow text-honey-700">Te invitaron</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight text-ink-900">{headerTitle}</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {clubName && eventTitle ? (
              <>
                {inviter ? `${inviter} te invitó al club.` : 'Te invitaron al club.'} Primero:{' '}
                <b className="text-ink-700">{eventTitle}</b>.
              </>
            ) : inviter ? (
              `${inviter} te invitó a unirte.`
            ) : (
              'Te invitaron a unirte.'
            )}
          </p>
        </div>

        <div className="bg-paper px-[26px] py-[26px]">
          {sent ? (
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-bold text-ink-900">Revisa tu correo</h2>
              <p className="text-sm text-ink-500">
                Te mandamos un enlace a <b className="text-honey-700">{email}</b>. Ábrelo en este mismo navegador.
              </p>
              <BeeLoader />
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-ink-700">Pon tu correo y te mandamos un enlace para entrar. Sin contraseñas.</p>
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
            </>
          )}
        </div>
      </div>
    </main>
  )
}
