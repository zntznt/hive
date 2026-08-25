'use client'

import { Input } from '@/components/ui/Input'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useT } from '@/components/ui/LangProvider'
import { BrandMark } from '@/components/ui/BrandMark'
import { authOrigin } from '@/lib/site-url'

type Props = {
  token: string
  clubName: string
}

export default function ClubJoinSignIn({ token, clubName }: Props) {
  const tr = useT()
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
        emailRedirectTo: `${authOrigin()}/auth/callback?next=${encodeURIComponent(`/c/${token}`)}`,
        data: { club_join_token: token },
      },
    })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-entry flex-col justify-center px-4 pb-10 pt-6">
      <div className="overflow-hidden rounded-2xl border border-line-card bg-paper shadow-raised">
        <div className="mb-4 flex justify-center">
          <BrandMark size="sm" showWordmark={false} />
        </div>
        <p className="eyebrow mb-1 text-center text-honey-700">{tr('club.joinTo')}</p>
        <h1 className="mb-6 text-center font-display text-xl font-bold text-ink-900">
          «{clubName}»
        </h1>

        {sent ? (
          /* One sentence, not `signin.checkEmailLink` with "aquí y pedir tu
             ingreso." welded onto the end of it. That join left a dangling
             half-clause in Spanish under an English sentence, and it read as a
             rendering fault. */
          <p className="rounded-md bg-honey-50 p-4 text-center text-ink-700">{tr('club.join.sent')}</p>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <p className="text-center text-sm text-ink-500">{tr('inv.emailIntro')}</p>
            {/* The app's Input, so this types at 14px in the same box as the
                identical field on /i/{token}. It was hand-rolled with no text
                size, which meant 16px in a taller box. */}
            <Input
              id="email"
              type="email"
              required
              label={tr('inv.yourEmail')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr('inv.email.example')}
            />
            <Button type="submit" block size="lg" disabled={sending}>
              {tr(sending ? 'common.sending' : 'common.continue')}
            </Button>
            {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          </form>
        )}
      </div>
    </main>
  )
}
