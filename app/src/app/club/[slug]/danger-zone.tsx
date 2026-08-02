'use client'

import { useState, useTransition } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useT, useTf } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { leaveClub, deleteClub } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

// Leaving and deleting are lifecycle, so they live in the club's ⋯ menu rather
// than in a red box at the bottom of the page. Pass `openWhich` and `onClose`
// to drive the confirmations from there; without them it still draws its own
// buttons, which is how it is used anywhere else.
export function DangerZone({
  clubId,
  clubName,
  isAdmin,
  isLastAdmin,
  memberCount,
  openWhich,
  onClose,
}: {
  clubId: string
  clubName: string
  isAdmin: boolean
  isLastAdmin: boolean
  memberCount: number
  openWhich?: 'leave' | 'delete' | null
  onClose?: () => void
}) {
  const tr = useT()
  const tf = useTf()
  const [selfModal, setSelfModal] = useState<'leave' | 'delete' | null>(null)
  const [pending, startTransition] = useTransition()
  const controlled = openWhich !== undefined
  const modal = controlled ? openWhich : selfModal
  const setModal = (v: 'leave' | 'delete' | null) => {
    if (controlled) {
      if (!v) onClose?.()
    } else setSelfModal(v)
  }

  return (
    <div>
      {!controlled && (
        <>
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
        </>
      )}

      {modal === 'leave' && (
        <Modal
          open
          onClose={() => setModal(null)}
          title={tf('club.leave?', { club: clubName })}
          subtitle={isLastAdmin ? tr('club.lastAdmin') : tr('club.reinvited')}
          footer={
            isLastAdmin ? (
              <Button onClick={() => setModal(null)}>{tr('club.gotIt')}</Button>
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
              <span aria-hidden="true"><Icon name="triangle-exclamation" size={13} /></span>
              <p className="text-[13.5px] leading-relaxed text-ink-700">
                Eres el único admin. Un club no se puede quedar sin admin, así que pasa el puesto a otro miembro
                primero, o elimina el club.
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-ink-700">{tr('club.leave.warn')}</p>
          )}
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal
          open
          onClose={() => setModal(null)}
          title={tf('club.delete?', { club: clubName })}
          subtitle={tr('club.irreversible')}
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
            <span aria-hidden="true"><Icon name="triangle-exclamation" size={13} /></span>
            <p className="text-[13.5px] leading-relaxed text-ink-700">
              Se elimina cada evento, categoría, aportación y balance de este club
              {memberCount === 1 ? tr('club.forOneMember') : tf('club.forNMembers', { n: memberCount })}. No hay
              manera de deshacerlo.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
