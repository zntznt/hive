'use client'

import { useActionState } from 'react'
import { requestJoinClub } from '@/app/actions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/BrandMark'

type Props = {
  token: string
  clubName: string
}

export default function ClubJoinRequest({ token, clubName }: Props) {
  const [state, formAction, pending] = useActionState(requestJoinClub.bind(null, token), null)
  const ok = state === 'ok'
  const error = state && !ok ? state : null

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

        {ok ? (
          <p className="rounded-md bg-success-bg p-4 text-center text-ink-700">
            Tu solicitud se envió. Quien administra {clubName} la va a revisar.
          </p>
        ) : (
          <form action={formAction} className="space-y-3">
            <p className="text-center text-sm text-ink-500">
              Manda tu solicitud para unirte. Quien administra el club la revisa antes de que
              entres.
            </p>
            <Button type="submit" block size="lg" disabled={pending}>
              {pending ? 'Enviando…' : 'Pedir unirme'}
            </Button>
            {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          </form>
        )}
      </Card>
    </main>
  )
}
