'use client'

import { useState } from 'react'
import { signOut, requestAccountDeletion } from '@/app/actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useT } from '@/components/ui/LangProvider'

// Sign out is a simple no-arg action, always safe to bind straight to a form.
// Account deletion redirects on success (requestAccountDeletion), so it must
// NOT be wrapped in a try/catch here - catching would swallow Next's
// redirect signal. The "type DELETE" guard keeps the throwing path
// (mismatched confirm text) effectively unreachable instead.
export default function DangerZone() {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  return (
    <div className="mt-[26px] rounded-lg border border-danger-bg bg-paper p-4">
      <div className="mb-2.5 text-xs font-bold uppercase tracking-wide text-danger">
        {tr('danger.zone')}
      </div>
      {/* Two equal halves, not a wrapping row. Flex sized each button to its
          own label, so "Cerrar sesión" and "Eliminar cuenta" came out different
          widths and the pair read as a primary and an afterthought. They are
          two ends of one decision and the grid says so. */}
      <div className="grid grid-cols-2 gap-2.5">
        <form action={signOut} className="contents">
          <Button type="submit" variant="secondary" size="sm" block>
            {tr('danger.signout')}
          </Button>
        </form>
        <Button type="button" variant="danger" size="sm" block onClick={() => setOpen(true)}>
          {tr('danger.delete')}
        </Button>
      </div>
      <p className="mt-2.5 text-xs text-ink-300">
        {tr('danger.note')}
      </p>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setConfirmText('')
        }}
        title={tr('account.delete.confirm')}
        subtitle={tr('account.irreversible')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tr('account.keep')}
            </Button>
            <Button
              type="submit"
              form="delete-account-form"
              variant="danger"
              disabled={confirmText !== 'DELETE'}
            >
              {tr('danger.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-700">
          {tr('account.deleteWarn')}
        </p>
        <form id="delete-account-form" action={requestAccountDeletion} className="mt-3.5">
          <Input
            label={tr('account.delete.type')}
            name="confirm"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </form>
      </Modal>
    </div>
  )
}
