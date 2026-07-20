'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/BrandMark'

type Props = {
  token: string
  clubName: string
}

export default function ClubJoinSignIn({ token, clubName }: Props) {
  const [email, setEmail] = useState('')
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
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(`/c/${token}`)}`,
        data: { club_join_token: token },
      },
    })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Card honeycomb>
        <div className="mb-4 flex justify-center">
          <BrandMark size="sm" variant="hex" showWordmark={false} />
        </div>
        <p className="eyebrow mb-1 text-center text-honey-700">Únete a</p>
        <h1 className="mb-6 text-center font-display text-xl font-bold text-ink-900">
          «{clubName}»
        </h1>

        {sent ? (
          <p className="rounded-md bg-honey-50 p-4 text-center text-ink-700">
            Revisa tu correo. Te mandamos un enlace, ábrelo en este mismo navegador para volver
            aquí y pedir tu ingreso.
          </p>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <p className="text-center text-sm text-ink-500">
              Pon tu correo y te mandamos un enlace para entrar. Sin contraseñas.
            </p>
            <label className="block text-sm text-ink-700" htmlFor="email">
              Tu correo
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full rounded-md border-[1.5px] border-line-input bg-paper p-3 outline-none focus:border-honey-500"
            />
            <Button type="submit" block size="lg" disabled={sending}>
              {sending ? 'Enviando…' : 'Continuar'}
            </Button>
            {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          </form>
        )}
      </Card>
    </main>
  )
}
