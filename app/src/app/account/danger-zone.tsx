'use client'

import { useState } from 'react'
import { signOut, requestAccountDeletion } from '@/app/actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

// Sign out is a simple no-arg action, always safe to bind straight to a form.
// Account deletion redirects on success (requestAccountDeletion), so it must
// NOT be wrapped in a try/catch here - catching would swallow Next's
// redirect signal. The "type DELETE" guard keeps the throwing path
// (mismatched confirm text) effectively unreachable instead.
export default function DangerZone() {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  return (
    <div className="mt-6 rounded-lg border border-danger-bg bg-paper p-4">
      <div className="mb-2.5 text-xs font-bold uppercase tracking-wide text-danger">
        Zona de riesgo
      </div>
      <div className="flex flex-wrap gap-2.5">
        <form action={signOut}>
          <Button type="submit" variant="secondary" size="sm">
            Cerrar sesión
          </Button>
        </form>
        <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
          Eliminar cuenta
        </Button>
      </div>
      <p className="mt-2.5 text-xs text-ink-300">
        Tu asistencia y gastos pasados se quedan en el historial de los clubes; tu perfil y tu
        forma de entrar se eliminan.
      </p>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setConfirmText('')
        }}
        title="¿Eliminar tu cuenta?"
        subtitle="Esto no se puede deshacer"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Mantener mi cuenta
            </Button>
            <Button
              type="submit"
              form="delete-account-form"
              variant="danger"
              disabled={confirmText !== 'DELETE'}
            >
              Eliminar cuenta
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-700">
          Vas a cerrar sesión y no vas a poder volver a entrar. Tu nombre va a aparecer como
          &quot;cuenta eliminada&quot; en eventos pasados, y cualquier dinero que debas o te deban
          no se salda solo, liquídalo antes.
        </p>
        <form id="delete-account-form" action={requestAccountDeletion} className="mt-3.5">
          <Input
            label="Escribe DELETE para confirmar"
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
