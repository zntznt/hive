'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/BrandMark'
import { BeeLoader } from '@/components/ui/BeeLoader'

function humanize(raw: string) {
  const s = raw.toLowerCase()
  if (s.includes('expired') || s.includes('invalid') || s.includes('not found') || s === 'missing_code' || s.includes('otp'))
    return 'Ese enlace ya se usó o ya venció. Cada enlace sirve una sola vez (a veces el correo lo abre solo antes que tú). Pide uno nuevo.'
  if (s.includes('rate') || s.includes('security purposes'))
    return 'Muchos intentos seguidos. Espera un minuto y vuelve a pedir el enlace.'
  return raw
}

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // surface auth errors from the callback redirect (?auth_error=) and from
  // GoTrue fragment-style errors (#error_code=otp_expired…). window.location
  // isn't available during SSR, so this can't be computed during render; it's
  // a one-time sync from a non-React browser API on mount, the documented
  // exception to "don't setState in effects".
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('auth_error')
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const fromHash = hash.get('error_description') ?? hash.get('error_code')
    const msg = query ?? fromHash
    if (msg) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(humanize(msg.replace(/\+/g, ' ')))
      window.history.replaceState(null, '', '/')
    }
  }, [])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError(null)
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setSending(false)
    if (error) setError(humanize(error.message))
    else setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      {/* Dark hero card. Tailwind's bg- and text- utilities are class selectors,
          so they win over the global `input { color; background-color }` rule
          (an element selector) regardless of source order; no !important needed. */}
      <div className="rounded-2xl bg-charcoal px-7 py-8 shadow-pop">
        <div className="mb-6">
          <BrandMark variant="invert" />
        </div>

        {sent ? (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-on-dark">Revisa tu correo</h1>
            <p className="text-sm text-on-dark-mute">
              Te mandamos un enlace para entrar{email ? <> a <b className="text-honey-400">{email}</b></> : null}.
              Ábrelo en este mismo navegador.
            </p>
            <BeeLoader />
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-xs text-on-dark-mute underline"
            >
              ¿No te llegó? Pídelo de nuevo
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-1">
            <h1 className="font-display text-[30px] leading-[1.1] font-bold text-on-dark">
              Tu club,
              <br />
              organizado.
            </h1>
            <p className="mt-2 mb-5 text-sm text-on-dark-mute">Bienvenido al enjambre. Busquemos fecha.</p>
            <div className="mb-3 flex flex-col gap-1.5">
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
              {sending ? 'Enviando…' : 'Mándame el enlace para entrar'}
            </Button>
            {error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
            <p className="mt-4 text-center text-xs text-on-dark-mute">Sin contraseñas.</p>
          </form>
        )}
      </div>
      <p className="mt-3.5 text-center text-[11.5px] text-ink-300">
        ¿Te invitaron por WhatsApp? Usa el enlace que te llegó.
      </p>
    </main>
  )
}
