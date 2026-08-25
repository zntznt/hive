'use client'

import { useActionState } from 'react'
import { requestJoinClub } from '@/app/actions'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/BrandMark'
import { useT, useTf } from '@/components/ui/LangProvider'

type Props = {
  token: string
  clubName: string
}

export default function ClubJoinRequest({ token, clubName }: Props) {
  const tr = useT()
  const tf = useTf()
  const [state, formAction, pending] = useActionState(requestJoinClub.bind(null, token), null)
  const ok = state === 'ok'
  const error = state && !ok ? state : null

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

        {ok ? (
          <p className="rounded-md bg-success-bg p-4 text-center text-ink-700">
            {tf('club.request.sent', { club: clubName })}
          </p>
        ) : (
          <form action={formAction} className="space-y-3">
            <p className="text-center text-sm text-ink-500">{tr('club.request.intro')}</p>
            <Button type="submit" block size="lg" disabled={pending}>
              {tr(pending ? 'common.sending' : 'club.request.action')}
            </Button>
            {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          </form>
        )}
      </div>
    </main>
  )
}
