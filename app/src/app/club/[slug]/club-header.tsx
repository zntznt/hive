'use client'

import { useState, type ReactNode } from 'react'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { FaceStack } from '@/components/ui/FaceStack'
import { type AvatarUser } from '@/components/ui/Avatar'
import { BANNER_ASPECT_CLASS } from '@/lib/banner'

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

  // The familiar shape: a cover strip, the picture straddling its bottom edge,
  // everything centred under it. It reads as a club home immediately because it
  // reads like every profile people already know.
  //
  // The banner used to fade into the content, on the theory that it should read
  // as one surface. With the honeycomb texture that was fine; with a real photo
  // it turned any cover into muddy beige, because the fade hits .9 opacity by
  // the midpoint and eats the image. So the photo is a crisp strip now and the
  // content sits on paper below it, the avatar bridging the two. No photo means
  // the honeycomb texture, which is what the strip is for.
  return (
    <section className="relative mb-[18px] overflow-hidden rounded-lg border border-line-card bg-paper text-center">
      <div
        className={`relative ${BANNER_ASPECT_CLASS} bg-cover bg-center`}
        style={
          bannerUrl
            ? { backgroundImage: `url(${bannerUrl})` }
            : { backgroundColor: 'var(--cream)', backgroundImage: 'var(--honeycomb)' }
        }
      >
        {cover && <div className="absolute right-2.5 top-2.5">{cover}</div>}
        {foldedByDefault && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded
            className="tap absolute left-2.5 top-2.5 inline-flex min-h-11 items-center rounded-pill bg-charcoal/55 px-2.5 text-xs font-bold text-on-dark"
          >
            Ocultar
          </button>
        )}
      </div>

      <div className="px-4 pb-4">
        {/* pulled up so it straddles the strip's bottom edge, on a paper hex so
            it separates cleanly from whatever the cover photo is */}
        <span className="relative -mt-[40px] mx-auto grid h-[76px] w-[70px] place-items-center bg-paper [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
          {picture ?? <HexAvatar name={name} src={avatarUrl} size={64} />}
        </span>

        <span className="mt-2 flex flex-wrap items-center justify-center gap-2">
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
