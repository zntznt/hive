'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { leaveClub, deleteClub } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

export function DangerZone({ clubId, clubName, isAdmin, isLastAdmin, memberCount }: { clubId: string; clubName: string; isAdmin: boolean; isLastAdmin: boolean; memberCount: number }) {
  const [modal, setModal] = useState<'leave' | 'delete' | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" size="sm" onClick={() => setModal('leave')}>
          Salir del club
        </Button>
        {isAdmin && (
          <Button variant="danger" size="sm" onClick={() => setModal('delete')}>
            Eliminar club
          </Button>
        )}
      </div>
      <p className="mt-2.5 text-xs text-ink-300">
        Cualquiera puede salir. Un club siempre necesita al menos un admin, así que el último admin debe pasar el
        puesto o eliminar el club.
      </p>

      {modal === 'leave' && (
        <Modal
          open
          onClose={() => setModal(null)}
          title={`¿Salir de ${clubName}?`}
          subtitle={isLastAdmin ? 'Eres el último admin' : 'Te pueden volver a invitar después'}
          footer={
            isLastAdmin ? (
              <Button onClick={() => setModal(null)}>Entendido</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setModal(null)}>
                  Quedarme
                </Button>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await leaveClub(clubId)
                    })
                  }
                >
                  Salir del club
                </Button>
              </>
            )
          }
        >
          {isLastAdmin ? (
            <div className="flex items-start gap-3 rounded-md bg-warning-bg px-3.5 py-3.5">
              <span aria-hidden="true"><Icon name="warning" size={13} /></span>
              <p className="text-[13.5px] leading-relaxed text-ink-700">
                Eres el único admin. Un club no se puede quedar sin admin, así que pasa el puesto a otro miembro
                primero, o elimina el club.
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-ink-700">Sales del roster y dejas de ver los eventos de este club. Tu historial se queda intacto.</p>
          )}
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal
          open
          onClose={() => setModal(null)}
          title={`¿Eliminar ${clubName}?`}
          subtitle="Esto no se puede deshacer"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Conservar club
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteClub(clubId)
                  })
                }
              >
                Eliminar club
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-md bg-danger-bg px-3.5 py-3.5">
            <span aria-hidden="true"><Icon name="warning" size={13} /></span>
            <p className="text-[13.5px] leading-relaxed text-ink-700">
              Se elimina cada evento, categoría, aportación y balance de este club para los {memberCount} miembros. No hay
              manera de deshacerlo.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
