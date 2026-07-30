'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AppBar, type MenuItem } from '@/components/ui/AppBar'
import { useToast } from '@/components/ui/Toast'
import { setEventStatus } from '@/app/actions'

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
}: {
  eventId: string
  slug: string
  title: string
  status: string
  clubName?: string | null
  clubSlug?: string | null
  isOrganizer: boolean
}) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const router = useRouter()

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
      toast('No se pudo copiar. Mantén presionado el enlace.')
    }
  }

  const menu: (MenuItem | false)[] = [
    { label: 'Copiar enlace', icon: 'link', onClick: copyLink },
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
        label: 'Cancelar evento',
        icon: 'ban',
        danger: true,
        disabled: pending,
        onClick: () => setStatus('cancelled', 'Evento cancelado. Se avisó a quienes iban.'),
      },
  ]

  return (
    <AppBar
      title={title}
      subtitle={clubName ?? undefined}
      subtitleHref={clubSlug ? `/club/${clubSlug}` : undefined}
      backHref={clubSlug ? `/club/${clubSlug}` : '/events'}
      action={isOrganizer ? { label: 'Invitar', icon: 'user-plus', href: `/e/${slug}/invites` } : undefined}
      menu={menu}
    />
  )
}
