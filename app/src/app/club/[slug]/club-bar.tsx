'use client'

import { useState } from 'react'
import { AppBar, type MenuItem } from '@/components/ui/AppBar'
import { InviteModal } from './invite-modal'
import { DangerZone } from './danger-zone'

// The club's top bar.
//
// One primary action, and for a club it is Invitar: adding people is the only
// thing you do here often enough to earn the honey. Creating an event is a
// bigger, rarer decision and gets the block button further down the page,
// under the categories it will be filed into.
//
// Everything else about running the club lives in the ⋯ menu. That is what
// let the "ajustes del club" section go: leaving and deleting are lifecycle,
// and lifecycle belongs in the overflow, not in a red box that every member
// scrolls past on every visit.

export function ClubBar({
  clubId,
  slug,
  clubName,
  memberCount,
  isManager,
  isAdmin,
  isLastAdmin,
  pastCount,
}: {
  clubId: string
  slug: string
  clubName: string
  memberCount: number
  isManager: boolean
  isAdmin: boolean
  isLastAdmin: boolean
  pastCount: number
}) {
  const [inviting, setInviting] = useState(false)
  const [danger, setDanger] = useState<'leave' | 'delete' | null>(null)

  const menu: (MenuItem | false)[] = [
    isManager && { label: 'Nuevo evento', icon: 'plus' as const, href: `/club/${slug}/new-event` },
    { label: 'Miembros', icon: 'users' as const, href: `/club/${slug}/members` },
    pastCount > 0 && {
      label: 'Historial completo',
      icon: 'clock-rotate-left' as const,
      href: `/events?club=${clubId}&when=past`,
    },
    { label: 'Salir del club', icon: 'arrow-right-from-bracket' as const, onClick: () => setDanger('leave') },
    isAdmin && { label: 'Eliminar club', icon: 'trash' as const, danger: true, onClick: () => setDanger('delete') },
  ]

  return (
    <>
      <AppBar
        title={clubName}
        subtitle={`${memberCount} ${memberCount === 1 ? 'miembro' : 'miembros'}`}
        subtitleHref={`/club/${slug}/members`}
        backHref="/clubs"
        action={isManager ? { label: 'Invitar', icon: 'user-plus', onClick: () => setInviting(true) } : undefined}
        menu={menu}
      />
      {inviting && (
        <InviteModal
          clubId={clubId}
          slug={slug}
          clubName={clubName}
          isAdmin={isAdmin}
          open
          onClose={() => setInviting(false)}
        />
      )}
      <DangerZone
        clubId={clubId}
        clubName={clubName}
        isAdmin={isAdmin}
        isLastAdmin={isLastAdmin}
        memberCount={memberCount}
        openWhich={danger}
        onClose={() => setDanger(null)}
      />
    </>
  )
}
