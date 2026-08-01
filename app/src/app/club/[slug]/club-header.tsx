'use client'

import { useState, type ReactNode } from 'react'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { FaceStack } from '@/components/ui/FaceStack'
import { type AvatarUser } from '@/components/ui/Avatar'

// The club's front door, and the one card that changes shape with the day.
//
// It replaced three stacked things: a 110px banner, a name row under it, and a
// separate "about" card holding the description and links. That was 240px of
// masthead before anything you could act on, every day of the year. The
// description and the links are the reason the about card could be deleted;
// they belong on the front door, not in a box below it.
//
// On the day of an event the whole card folds to a strip, because the answer
// you came for is an address further down the page and this is not it. The
// chevron expands the full card in place, cameras and all, so the cover
// control never changes address depending on what day it is.
//
// Expanded is the default. Folding is what an event today does to it.

export function ClubHeader({
  name,
  avatarUrl,
  bannerUrl,
  description,
  role,
  faces,
  total,
  links,
  cover,
  picture,
  edit,
  foldedByDefault = false,
}: {
  name: string
  avatarUrl: string | null
  bannerUrl: string | null
  description: string | null
  role: string
  faces: AvatarUser[]
  total: number
  links: { label: string; url: string }[]
  // the manager-only affordances, passed in so this stays presentational and
  // the uploads keep owning their own modals
  cover?: ReactNode
  // the whole hexagon when a manager can change it, so the camera sits on the
  // mark rather than next to a second copy of it
  picture?: ReactNode
  edit?: ReactNode
  foldedByDefault?: boolean
}) {
  const [open, setOpen] = useState(!foldedByDefault)

  const badge =
    role === 'admin' ? <Badge tone="admin">admin</Badge> : role === 'organizer' ? <Badge>organizador</Badge> : null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="tap mb-[18px] flex min-h-[66px] w-full items-center gap-3 rounded-lg border border-line-card bg-paper px-3.5 py-2.5 text-left"
      >
        <HexAvatar name={name} src={avatarUrl} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[17px] font-bold text-ink-900">{name}</span>
          <span className="mt-0.5 flex">
            <FaceStack people={faces} total={total} size={19} max={5} />
          </span>
        </span>
        <Icon name="chevron-down" size={11} className="flex-shrink-0 text-ink-300" />
      </button>
    )
  }

  return (
    <section
      className="relative mb-[18px] overflow-hidden rounded-lg border border-line-card bg-paper text-center"
      style={{ backgroundColor: 'var(--cream)', backgroundImage: bannerUrl ? undefined : 'var(--honeycomb)' }}
    >
      {bannerUrl && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[124px] bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerUrl})` }}
        />
      )}
      {/* the field fades into paper so the head reads as one surface, not a
          banner glued to a card */}
      <div
        className="relative px-4 pb-4 pt-4"
        style={{
          background: bannerUrl
            ? 'linear-gradient(180deg, rgba(251,247,239,.18) 0%, rgba(251,247,239,.9) 46%, var(--paper) 100%)'
            : 'linear-gradient(180deg, rgba(251,247,239,0) 0%, rgba(251,247,239,.86) 44%, var(--paper) 100%)',
        }}
      >
        {cover && <div className="absolute right-2.5 top-2.5">{cover}</div>}
        {foldedByDefault && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded
            className="tap absolute left-2.5 top-2.5 inline-flex min-h-11 items-center px-1 text-xs font-bold text-honey-800"
          >
            Ocultar
          </button>
        )}

        <span className="relative mx-auto flex w-[76px] justify-center">
          {picture ?? <HexAvatar name={name} src={avatarUrl} size={64} />}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
          <span className="font-display text-[21px] font-bold leading-tight text-ink-900">{name}</span>
          {badge}
          {edit}
        </span>

        {description && (
          <p className="mx-auto mt-2 max-w-[38ch] text-[13.5px] leading-relaxed text-ink-700">{description}</p>
        )}

        {links.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.url.startsWith('http') ? l.url : `https://${l.url}`}
                target="_blank"
                rel="noreferrer"
                className="tap inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-card bg-paper px-3.5 text-[13px] font-bold text-ink-900"
              >
                <Icon name="link" size={12} className="text-ink-300" />
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
