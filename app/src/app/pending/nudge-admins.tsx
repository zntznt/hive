'use client'

import { useState, useTransition } from 'react'
import { nudgeAdmins } from '../actions'
import { Button } from '@/components/ui/Button'
import { useT } from '@/components/ui/LangProvider'
import { useToast } from '@/components/ui/Toast'

// Agency, mostly. The screen already says we know you arrived, so this does
// not make approval faster, it makes waiting feel less like shouting into a
// void. Once a day, because a queue of one person pressing a button is what
// would make admins stop reading the notification.
export default function NudgeAdmins({ alreadyNudged }: { alreadyNudged: boolean }) {
  const tr = useT()
  const [sent, setSent] = useState(alreadyNudged)
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  if (sent) return <p className="text-[12.5px] text-ink-300">{tr('pending.nudged')}</p>

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await nudgeAdmins()
          setSent(true)
          toast(res.already ? tr('pending.nudgedToday') : tr('pending.told'))
        })
      }
    >
      {pending ? tr('common.sending') : tr('pending.remind')}
    </Button>
  )
}
