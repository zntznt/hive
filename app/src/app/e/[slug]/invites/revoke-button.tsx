'use client'

import { useTransition } from 'react'
import { revokeInvitation } from '@/app/actions'

// Taking an invitation back. The row could copy and resend forever but never
// undo, so a link sent to the wrong number stayed live until it expired.
export default function RevokeButton({
  invitationId,
  path,
  label,
}: {
  invitationId: string
  path: string
  label: string
}) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await revokeInvitation(invitationId, path) })}
      className="tap -my-2 inline-flex min-h-11 items-center px-1 text-xs font-bold text-danger disabled:opacity-50"
    >
      {label}
    </button>
  )
}
