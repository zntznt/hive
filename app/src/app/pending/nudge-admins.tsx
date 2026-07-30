'use client'

import { useState, useTransition } from 'react'
import { nudgeAdmins } from '../actions'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

// Agency, mostly. The screen already says we know you arrived, so this does
// not make approval faster, it makes waiting feel less like shouting into a
// void. Once a day, because a queue of one person pressing a button is what
// would make admins stop reading the notification.
export default function NudgeAdmins({ alreadyNudged }: { alreadyNudged: boolean }) {
  const [sent, setSent] = useState(alreadyNudged)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  if (sent) return <p className="text-[12.5px] text-ink-300">Ya les avisamos. Te toca esperar un poco.</p>

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await nudgeAdmins()
          setSent(true)
          toast(res.already ? 'Ya les habíamos avisado hoy' : 'Les avisamos')
        })
      }
    >
      {pending ? 'Avisando…' : 'Recuérdales'}
    </Button>
  )
}
