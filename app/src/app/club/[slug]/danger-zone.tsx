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
              {tr('club.bar.leave')}
            </Button>
            {isAdmin && (
              <Button variant="danger" size="sm" onClick={() => setModal('delete')}>
                {tr('club.bar.delete')}
              </Button>
            )}
          </div>
          <p className="mt-2.5 text-xs text-ink-300">
            {tr('club.danger.leaveNote')}
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
                  {tr('club.bar.leave')}
                </Button>
              </>
            )
          }
        >
          {isLastAdmin ? (
            <div className="flex items-start gap-3 rounded-md bg-warning-bg px-3.5 py-3.5">
              <span aria-hidden="true"><Icon name="triangle-exclamation" size={13} /></span>
              <p className="text-[13.5px] leading-relaxed text-ink-700">
                {tr('club.danger.onlyAdmin')}
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
                {tr('club.bar.delete')}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-md bg-danger-bg px-3.5 py-3.5">
            <span aria-hidden="true"><Icon name="triangle-exclamation" size={13} /></span>
            <p className="text-[13.5px] leading-relaxed text-ink-700">
              {tf('club.danger.deleteNote', { members: memberCount === 1 ? tr('club.forOneMember') : tf('club.forNMembers', { n: memberCount }) })}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
