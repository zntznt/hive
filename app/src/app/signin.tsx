'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-1 text-3xl font-semibold text-amber-600">Hive</h1>
      <p className="mb-8 text-stone-500">Tu club, organizado.</p>

      {sent ? (
        <p className="rounded-xl bg-amber-50 p-4 text-stone-700">
          Revisa tu correo — el enlace mágico te trae de vuelta. Puedes cerrar esta pestaña.
        </p>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <label className="block text-sm text-stone-600" htmlFor="email">
            Tu email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full rounded-xl border border-stone-300 p-3 outline-amber-500"
          />
          <button className="w-full rounded-xl bg-amber-500 p-3 font-medium text-white hover:bg-amber-600">
            Enviarme el enlace mágico
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="pt-2 text-xs text-stone-400">
            Sin contraseñas. Si te invitaron por WhatsApp, entra con el enlace personal que te
            llegó. (Acceso por código de WhatsApp: en camino — docs/03.)
          </p>
        </form>
      )}
    </main>
  )
}
