'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { requestJoinClub } from '@/app/actions'

export function RequestJoinClubButton({ joinToken }: { joinToken: string }) {
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
      Pedir unirme
    </Button>
  )
}
