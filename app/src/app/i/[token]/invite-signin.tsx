'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

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
      <p className="mb-1 text-sm font-medium text-amber-600">Hive</p>
      <h1 className="mb-1 text-2xl font-semibold text-stone-800">
        {inviter ? `${inviter} te invita a` : 'Te invitaron a'}
      </h1>
      <p className="mb-8 text-xl text-stone-700">
        «{title}»{clubName ? <span className="text-stone-400"> · {clubName}</span> : null}
      </p>

      {sent ? (
        <p className="rounded-xl bg-amber-50 p-4 text-stone-700">
          Revisa tu correo. Te mandamos un enlace que te lleva directo al evento; ábrelo en este
          mismo navegador.
        </p>
      ) : (
        <form onSubmit={send} className="space-y-3">
          {phoneOnly && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-stone-600">
              Te invitaron por WhatsApp. Por ahora se entra con correo; pon el tuyo y tu
              invitación queda ligada.
            </p>
          )}
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
            className="w-full rounded-xl border border-stone-300 bg-white p-3 outline-amber-500"
          />
          <button
            disabled={sending}
            className="w-full rounded-xl bg-amber-500 p-3 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {sending ? 'Enviando…' : 'Entrar'}
          </button>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p className="pt-2 text-xs text-stone-400">Sin contraseñas, sin formularios.</p>
        </form>
      )}
    </main>
  )
}
