'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/BrandMark'
import { BeeLoader } from '@/components/ui/BeeLoader'

type Props = {
  token: string
  title: string
  inviter: string | null
  clubName: string | null
  presetEmail: string | null
  phoneOnly: boolean
}

export default function InviteSignIn({ token, title, inviter, clubName, presetEmail, phoneOnly }: Props) {
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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      {/* Same dark hero card treatment as /signin.tsx. */}
      <div className="rounded-2xl bg-charcoal px-7 py-8 shadow-pop">
        <div className="mb-6">
          <BrandMark variant="invert" />
        </div>

        {sent ? (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-on-dark">Revisa tu correo</h1>
            <p className="text-sm text-on-dark-mute">
              Te mandamos un enlace que te lleva directo al evento. Ábrelo en este mismo navegador.
            </p>
            <BeeLoader />
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl leading-[1.2] font-bold text-on-dark">
              {inviter ? `${inviter} te invita a` : 'Te invitaron a'}
            </h1>
            <p className="mt-1 mb-6 text-lg text-on-dark">
              «{title}»
              {clubName ? <span className="text-on-dark-mute"> · {clubName}</span> : null}
            </p>
            <form onSubmit={send} className="space-y-3">
              {phoneOnly && (
                <p className="rounded-md border border-charcoal-3 bg-charcoal-2 p-3 text-xs text-on-dark-mute">
                  Te invitaron por WhatsApp. Por ahora se entra con correo; pon el tuyo y tu
                  invitación queda ligada.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12.5px] font-semibold text-on-dark-mute" htmlFor="email">
                  Tu correo
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="rounded-md border border-charcoal-3 bg-charcoal-2 px-[14px] py-[13px] text-sm text-on-dark outline-none placeholder:text-on-dark-mute focus:border-honey-500"
                />
              </div>
              <Button display block size="lg" disabled={sending}>
                {sending ? 'Enviando…' : 'Entrar'}
              </Button>
              {error && <p className="rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
              <p className="pt-1 text-center text-xs text-on-dark-mute">Sin contraseñas, sin formularios.</p>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
