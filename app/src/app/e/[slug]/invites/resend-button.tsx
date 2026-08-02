'use client'

import { useState, useTransition } from 'react'
import { resendInvitation } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { useT } from '@/components/ui/LangProvider'

// Same token, same link, so an invitation sitting twice in someone's inbox
// still leads to one account. Goes quiet after a send rather than staying
// tappable, since the useful thing to do next is wait, not send again.
export default function ResendButton({ invitationId, path }: { invitationId: string; path: string }) {
  const tr = useT()
  const toast = useToast()
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  if (sent) return <span className="flex-shrink-0 text-[12.5px] font-bold text-ink-300">{tr('inv.resentShort')}</span>

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await resendInvitation(invitationId, path)
          if (res.ok) {
            setSent(true)
            toast(tr('inv.resent'))
          } else {
            toast(res.error)
          }
        })
      }
      className="tap flex-shrink-0 rounded-md border-[1.5px] border-honey-500 px-2.5 py-1 text-xs font-bold text-honey-700 disabled:opacity-50"
    >
      {pending ? tr('common.sending') : tr('signin.resend')}
    </button>
  )
}
