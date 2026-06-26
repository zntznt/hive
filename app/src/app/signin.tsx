'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

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
  // GoTrue fragment-style errors (#error_code=otp_expired…)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('auth_error')
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const fromHash = hash.get('error_description') ?? hash.get('error_code')
    const msg = query ?? fromHash
    if (msg) {
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
      <h1 className="mb-1 text-3xl font-semibold text-amber-600">Hive</h1>
      <p className="mb-8 text-stone-500">Tu club, organizado.</p>

      {sent ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 p-4 text-stone-700">
            Revisa tu correo. Te mandamos un enlace para entrar; ábrelo en este mismo navegador.
          </p>
          <button onClick={() => setSent(false)} className="text-sm text-stone-500 underline">
            ¿No te llegó? Pídelo de nuevo
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <label className="block text-sm text-stone-600" htmlFor="email">
            Tu correo
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="w-full rounded-xl border border-stone-300 p-3 outline-amber-500"
          />
          <button
            disabled={sending}
            className="w-full rounded-xl bg-amber-500 p-3 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {sending ? 'Enviando…' : 'Mándame el enlace para entrar'}
          </button>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p className="pt-2 text-xs text-stone-400">
            Sin contraseñas. Si te invitaron por WhatsApp, usa el enlace que te llegó.
          </p>
        </form>
      )}
    </main>
  )
}
