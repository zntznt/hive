'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useT, useLang } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { updateMemberRole, removeMember, requestMemberRemoval } from '@/app/actions'
import { timeAgo } from '@/lib/relative-time'

type Role = 'member' | 'organizer' | 'admin'

export function MemberRow({
  clubId,
  slug,
  userId,
  user,
  role,
  isAdmin,
  isOrganizer,
  isSelf,
  lastAttendedAt,
  eventsAttended,
  recordedEvents,
  estimatedEvents,
}: {
  clubId: string
  slug: string
  userId: string
  user: AvatarUser
  role: Role
  isAdmin: boolean
  isOrganizer: boolean
  isSelf: boolean
  // roster stat: when this member last came, and how often. Sits under the
  // name rather than to the right of it, because the right side already holds
  // the role select and a phone has no room for both.
  lastAttendedAt?: string | null
  eventsAttended?: number
  // how that count was arrived at. Recorded means an organizer passed the roll
  // call; estimated means the event finished before roll call existed and the
  // count is really "said they were coming".
  recordedEvents?: number
  estimatedEvents?: number
}) {
  const lang = useLang()
  const tr = useT()
  const name = user.display_name
  const [pending, startTransition] = useTransition()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [requestedRemoval, setRequestedRemoval] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const router = useRouter()

  // A count with any inferred events in it gets a "~" and a dotted underline,
  // and that is all. A badge or a warning colour here would put a scarlet
  // letter on every event that happened before the feature shipped. A fully
  // recorded count gets no marker at all: the clean case has to stay silent or
  // the marker stops meaning anything.
  const estimated = (estimatedEvents ?? 0) > 0
  const mixed = estimated && (recordedEvents ?? 0) > 0
  const countNote = !estimated
    ? tr('club.roster.recorded')
    : mixed
      ? tr('club.roster.fromRsvp2')
      : tr('club.roster.allRsvp2')

  function changeRole(next: Role) {
    startTransition(async () => {
      await updateMemberRole(clubId, slug, userId, next)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t border-line-divider px-[13px] py-[11px] first:border-t-0">
      <span className="flex min-w-0 items-center gap-2.5">
        <UserAvatar user={user} size={28} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-ink-900">{name}</span>
            {(!isAdmin || isSelf) && role !== 'member' && (
              <Badge tone={role === 'admin' ? 'admin' : 'neutral'}>{role}</Badge>
            )}
          </span>
          <span className="text-[11.5px] text-ink-300">
            {eventsAttended ? (
              <>
                {timeAgo(lastAttendedAt ?? null, lang)} ·{' '}
                {/* a real 44px target, with the extra height cancelled by
                    negative margin so it clears the hit floor without
                    changing the line it sits on */}
                <button
                  type="button"
                  onClick={() => setExplaining((v) => !v)}
                  aria-label={`${eventsAttended} ev. · cómo se cuenta`}
                  aria-expanded={explaining}
                  className="-my-[13px] inline-flex min-h-11 items-center px-1 font-inherit text-inherit"
                >
                  <span className={estimated ? 'border-b border-dotted border-ink-300' : ''}>
                    {estimated ? '~' : ''}
                    {eventsAttended} ev.
                  </span>
                </button>
              </>
            ) : (
              tr('club.roster.none')
            )}
          </span>
          {explaining && (
            <span className="mt-1.5 block rounded-md bg-cream-sunk px-3.5 py-3 text-xs leading-relaxed text-ink-700">
              {countNote}
            </span>
          )}
        </span>
      </span>
      {!isSelf && (
        <span className="flex flex-shrink-0 items-center gap-2.5">
          {isAdmin ? (
            <>
              <select
                aria-label={`Rol de ${name}`}
                value={role}
                disabled={pending}
                onChange={(e) => changeRole(e.target.value as Role)}
                className="rounded-md border-[1.5px] border-line-input bg-paper px-1.5 py-1 text-xs font-bold text-ink-700"
              >
                <option value="member">miembro</option>
                <option value="organizer">organizador</option>
                <option value="admin">admin</option>
              </select>
              <button onClick={() => setConfirmRemove(true)} className="tap text-[12.5px] font-bold text-danger">
                Quitar
              </button>
            </>
          ) : /* only plain members: approve_change_request refuses a removal
                 aimed at an organizer or an admin, so offering it here would
                 be a button whose request can never be approved */
          isOrganizer && role === 'member' ? (
            <button
              disabled={requestedRemoval || pending}
              onClick={() =>
                startTransition(async () => {
                  await requestMemberRemoval(clubId, slug, userId)
                  setRequestedRemoval(true)
                })
              }
              className="tap text-[12.5px] font-bold text-ink-500 disabled:opacity-50"
            >
              {requestedRemoval ? 'Solicitud enviada' : tr('club.roster.remove')}
            </button>
          ) : null}
        </span>
      )}
      {confirmRemove && (
        <Modal
          open
          onClose={() => setConfirmRemove(false)}
          title={`¿Quitar a ${name}?`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  startTransition(async () => {
                    await removeMember(clubId, slug, userId)
                    setConfirmRemove(false)
                    router.refresh()
                  })
                }
              >
                Quitar
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-700">
            Pierde acceso al club y a sus eventos. Su historial de asistencia y gastos se queda en el registro.
          </p>
        </Modal>
      )}
    </div>
  )
}
