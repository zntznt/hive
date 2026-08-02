'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { requestJoinClub } from '@/app/actions'
import { useT } from '@/components/ui/LangProvider'

export function RequestJoinClubButton({ joinToken }: { joinToken: string }) {
  const tr = useT()
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    startTransition(async () => {
      await requestJoinClub(joinToken, null)
      router.refresh()
    })
  }

  return (
    <Button size="sm" disabled={pending} onClick={submit}>
      {tr('club.request.action')}
    </Button>
  )
}
