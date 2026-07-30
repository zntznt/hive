'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/BrandMark'
import { BeeLoader } from '@/components/ui/BeeLoader'
import { authOrigin } from '@/lib/site-url'
import { requestWhatsappCode, verifyWhatsappCode } from './actions'

// One field takes either a correo or a WhatsApp number (wireframe 1). '@' is
// the only reliable tell: Mexican numbers are written with spaces, dashes,
// parentheses and an optional +52, none of which appear in an address.
function looksLikeEmail(v: string) {
  return v.includes('@')
}

function humanize(raw: string) {
  const s = raw.toLowerCase()
  if (s.includes('expired') || s.includes('invalid') || s.includes('not found') || s === 'missing_code' || s.includes('otp'))
    return 'Ese enlace ya se usó o ya venció. Cada enlace sirve una sola vez (a veces el correo lo abre solo antes que tú). Pide uno nuevo.'
  if (s.includes('rate') || s.includes('security purposes'))
    return 'Muchos intentos seguidos. Espera un minuto y vuelve a pedir el enlace.'
  return raw
}

export default function SignIn() {
  const [contact, setContact] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viaWhatsapp, setViaWhatsapp] = useState(false)
  const [code, setCode] = useState('')

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
    const value = contact.trim()
    if (!value) return
    setSending(true)
    setError(null)

    const byEmail = looksLikeEmail(value)
    try {
      // The WhatsApp code is generated and sent server-side, so it never
      // touches the browser Supabase client.
      const result = byEmail
        ? await supabaseBrowser().auth.signInWithOtp({
            email: value,
            options: { emailRedirectTo: `${authOrigin()}/auth/callback` },
          })
        : await requestWhatsappCode(value)

      if ('error' in result && result.error) {
        setError(humanize(typeof result.error === 'string' ? result.error : result.error.message))
        return
      }
      setViaWhatsapp(!byEmail)
      setSent(true)
    } catch {
      setError('No pudimos completar el envío. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const res = await verifyWhatsappCode(contact.trim(), code)
      if (!res.ok) {
        setError(res.error)
        setCode('')
        return
      }
      // the session cookie is already written; a full load picks it up
      window.location.assign(res.next)
    } catch {
      setError('No pudimos completar el envío. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setSending(false)
    }
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
            <h1 className="font-display text-2xl font-bold text-on-dark">
              {viaWhatsapp ? 'Revisa tu WhatsApp' : 'Revisa tu correo'}
            </h1>
            {viaWhatsapp ? (
              <>
                <p className="text-sm text-on-dark-mute">
                  Te mandamos un código de 6 dígitos{contact ? <> a <b className="text-honey-400">{contact}</b></> : null}.
                  Escríbelo aquí para entrar.
                </p>
                <form onSubmit={confirm} className="space-y-3">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    aria-label="Código de 6 dígitos"
                    className="w-full rounded-md border border-charcoal-3 bg-charcoal-2 px-[14px] py-[13px] text-center font-display text-2xl tracking-[0.4em] text-on-dark outline-none placeholder:text-on-dark-mute focus:border-honey-500"
                  />
                  <Button display block size="lg" disabled={sending || code.length < 6}>
                    {sending ? 'Entrando…' : 'Entrar'}
                  </Button>
                  {error && <p className="rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
                </form>
                <p className="text-xs text-on-dark-mute">
                  Si ese número no tiene cuenta en Hive, no llegará nada. Prueba con tu correo.
                </p>
              </>
            ) : (
              <p className="text-sm text-on-dark-mute">
                Te mandamos un enlace para entrar{contact ? <> a <b className="text-honey-400">{contact}</b></> : null}.
                Ábrelo en este mismo navegador.
              </p>
            )}
            {!viaWhatsapp && <BeeLoader />}
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setCode('')
                setError(null)
              }}
              className="tap text-xs text-on-dark-mute underline"
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
              <label className="text-[12.5px] font-semibold text-on-dark-mute" htmlFor="contact">
                Tu correo o WhatsApp
              </label>
              <input
                id="contact"
                type="text"
                inputMode="email"
                autoComplete="email"
                required
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="tu@correo.com  ·  +52 55 1234 5678"
                className="rounded-md border border-charcoal-3 bg-charcoal-2 px-[14px] py-[13px] text-sm text-on-dark outline-none placeholder:text-on-dark-mute focus:border-honey-500"
              />
            </div>
            <Button display block size="lg" disabled={sending}>
              {sending ? 'Enviando…' : 'Mándame el enlace para entrar'}
            </Button>
            {error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
            <p className="mt-4 text-center text-xs text-on-dark-mute">
              Sin contraseñas. Te llega un enlace por WhatsApp o correo y entras.
            </p>
          </form>
        )}
      </div>
      <p className="mt-3.5 text-center text-[11.5px] text-ink-300">
        ¿Te invitaron por WhatsApp? Usa el enlace que te llegó.
      </p>
    </main>
  )
}
