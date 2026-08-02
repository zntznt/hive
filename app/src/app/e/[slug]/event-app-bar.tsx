'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AppBar, type MenuItem } from '@/components/ui/AppBar'
import { useToast } from '@/components/ui/Toast'
import { setEventStatus, setEventDeleted, requestEventDeletion } from '@/app/actions'
import { DuplicateModal, type CarryItem } from './duplicate-modal'
import { useT } from '@/components/ui/LangProvider'

// The event's whole lifecycle, collected into one menu.
//
// It used to be a row of text links above the title plus a pair of buttons
// two thirds down the page, so "cancel this event" sat in the body of the
// screen next to things members do. One primary action stays visible (invite,
// the thing an organizer actually opens this screen to do) and everything
// else moves behind the overflow.

export default function EventAppBar({
  eventId,
  slug,
  title,
  status,
  clubName,
  clubSlug,
  isOrganizer,
  isClubAdmin,
  isDeleted,
  duplicate,
}: {
  eventId: string
  slug: string
  title: string
  status: string
  clubName?: string | null
  clubSlug?: string | null
  isOrganizer: boolean
  // deleting takes attendance, expenses and a settled history with it, so an
  // admin does it and an organizer can only ask
  isClubAdmin: boolean
  isDeleted: boolean
  // Duplicating is a secondary organizer tool on a live event: it belongs with
  // the other organizer controls in this menu, never as a honey card competing
  // with the page's real primary action. The loud version is the done event's
  // recap, which is a different placement of the same thing.
  duplicate?: { clubName: string | null; carries: CarryItem[]; weeks: string[] }
}) {
  const tr = useT()
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const router = useRouter()
  const [duplicating, setDuplicating] = useState(false)

  const setStatus = (next: 'done' | 'cancelled' | 'scheduled', done: string) =>
    startTransition(async () => {
      await setEventStatus(eventId, slug, next)
      toast(done)
      router.refresh()
    })

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/e/${slug}`)
      toast('Enlace copiado')
    } catch {
      toast(tr('event.copyFailed'))
    }
  }

  const bin = (deleted: boolean) =>
    startTransition(async () => {
      await setEventDeleted(eventId, slug, deleted)
      toast(deleted ? tr('event.toBin') : 'Recuperado')
      router.refresh()
    })

  const askBin = (restore: boolean) =>
    startTransition(async () => {
      await requestEventDeletion(eventId, slug, restore)
      toast(tr('event.askedAdmin'))
      router.refresh()
    })

  const menu: (MenuItem | false)[] = [
    { label: 'Copiar enlace', icon: 'link', onClick: copyLink },
    isOrganizer &&
      !isDeleted &&
      status !== 'done' &&
      status !== 'cancelled' &&
      !!duplicate && { label: 'Duplicar evento', icon: 'copy' as const, onClick: () => setDuplicating(true) },
    isOrganizer && status !== 'cancelled' && { label: 'Editar evento', icon: 'pen', href: `/e/${slug}/edit` },
    isOrganizer &&
      status === 'scheduled' && {
        label: 'Marcar celebrado',
        icon: 'flag-checkered',
        disabled: pending,
        onClick: () => setStatus('done', 'Evento marcado como celebrado'),
      },
    isOrganizer &&
      status === 'done' && {
        label: 'Reabrir evento',
        icon: 'rotate-left',
        disabled: pending,
        onClick: () => setStatus('scheduled', 'Evento reabierto'),
      },
    isOrganizer &&
      status === 'scheduled' && {
        label: tr('event.cancelEvent'),
        icon: 'ban',
        danger: true,
        disabled: pending,
        onClick: () => setStatus('cancelled', tr('event.cancelledNotice')),
      },
    isClubAdmin &&
      !isDeleted && {
        label: tr('event.deleteEvent'),
        icon: 'trash',
        danger: true,
        disabled: pending,
        onClick: () => bin(true),
      },
    isClubAdmin &&
      isDeleted && { label: 'Recuperar evento', icon: 'rotate-left', disabled: pending, onClick: () => bin(false) },
    !isClubAdmin &&
      isOrganizer && {
        label: isDeleted ? 'Pedir recuperarlo' : 'Pedir eliminarlo',
        icon: isDeleted ? 'rotate-left' : 'trash',
        danger: !isDeleted,
        disabled: pending,
        onClick: () => askBin(isDeleted),
      },
  ]

  return (
    <>
      <AppBar
        title={title}
        subtitle={clubName ?? undefined}
        subtitleHref={clubSlug ? `/club/${clubSlug}` : undefined}
        backHref={clubSlug ? `/club/${clubSlug}` : '/events'}
        action={isOrganizer ? { label: tr('event.invite'), icon: 'user-plus', href: `/e/${slug}/invites` } : undefined}
        menu={menu}
      />
      {duplicating && duplicate && (
        <DuplicateModal
          eventId={eventId}
          clubName={duplicate.clubName}
          carries={duplicate.carries}
          weeks={duplicate.weeks}
          onClose={() => setDuplicating(false)}
        />
      )}
    </>
  )
}
