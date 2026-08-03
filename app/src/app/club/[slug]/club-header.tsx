'use client'

import { useState, type ReactNode } from 'react'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { FaceStack } from '@/components/ui/FaceStack'
import { type AvatarUser } from '@/components/ui/Avatar'
import { BANNER_ASPECT_CLASS } from '@/lib/banner'
import { useT } from '@/components/ui/LangProvider'

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
  const tr = useT()
  const [open, setOpen] = useState(!foldedByDefault)
  // A description is a paragraph, not a field, so it is clamped rather than
  // truncated and the toggle only exists once there is something behind the
  // clamp. Under 150 characters the fourth line is the last line, and a
  // "more" that reveals nothing is worse than no control at all.
  const [showAll, setShowAll] = useState(false)
  const clampable = (description ?? '').length > 150

  const badge =
    role === 'admin' ? <Badge tone="admin">admin</Badge> : role === 'organizer' ? <Badge>{tr('role.organizer')}</Badge> : null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="tap mb-[14px] mt-1 flex w-full items-center gap-3 rounded-md border border-line-card bg-paper px-[13px] py-[9px] text-left"
      >
        {/* the same paper hex as the full card, at strip scale, so folding
            shrinks the shape rather than swapping it for a different one */}
        <span className="grid h-[38px] w-[34px] flex-shrink-0 place-items-center bg-paper [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
          <HexAvatar name={name} src={avatarUrl} size={31} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-display text-[15.5px] font-bold text-ink-900">{name}</span>
          {/* no `total`, so no "+N". The strip is a reminder of whose club
              this is, not a roster count, and the full card one tap away is
              where the number belongs. */}
          <span className="flex">
            <FaceStack people={faces} size={17} max={5} />
          </span>
        </span>
        <Icon name="chevron-down" size={10} className="flex-shrink-0 text-ink-300" />
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
    <section className="relative mb-[26px] mt-1 overflow-hidden rounded-lg border border-line-card bg-paper shadow-card text-center">
      {/* `cover` is for the photograph and only the photograph. The honeycomb
          is a 28x49 tile meant to repeat, and stretching one copy of it across
          the whole strip drew two fat vertical bars: a club with no cover was
          wearing a smear rather than a texture. */}
      <div
        className={`relative ${BANNER_ASPECT_CLASS} ${bannerUrl ? 'bg-cover bg-center' : 'bg-repeat'}`}
        style={
          bannerUrl
            ? { backgroundImage: `url(${bannerUrl})` }
            : { backgroundColor: 'var(--cream)', backgroundImage: 'var(--honeycomb)' }
        }
      >
        {cover && <div className="absolute right-[3px] top-[3px]">{cover}</div>}
        {foldedByDefault && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded
            className="tap absolute left-2.5 top-2.5 inline-flex min-h-11 items-center rounded-pill bg-charcoal/55 px-2.5 text-xs font-bold text-on-dark"
          >
            {tr('common.hide')}
          </button>
        )}
      </div>

      <div className="px-4 pb-[14px]">
        {/* pulled up so it straddles the strip's bottom edge, on a paper hex so
            it separates cleanly from whatever the cover photo is */}
        <span className="relative -mt-[42px] mx-auto grid h-[80px] w-[74px] place-items-center bg-paper [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
          {picture ?? <HexAvatar name={name} src={avatarUrl} size={68} />}
        </span>

        <span className="mt-[5px] flex flex-wrap items-center justify-center gap-2">
          <span className="font-display text-[22px] font-bold leading-[1.15] text-ink-900">{name}</span>
          {badge}
          {edit}
        </span>

        {/* The spec puts "N miembros · N próximos" here, and names that as one
            of the two places this design disagrees with itself: the Clubs card
            deleted those counts because the footer says what is on by name.
            Resolved the way FaceStack's own note asks for, in faces, on both
            screens. Without it the card was the one place where expanding
            showed you LESS about the club than the folded strip did, which is
            the wrong direction for a control whose whole job is more. */}
        <span className="mt-1.5 flex justify-center">
          <FaceStack people={faces} total={total} size={20} max={4} />
        </span>

        {description && (
          <>
            <p
              className={`mx-auto mt-[10px] max-w-[38ch] text-[13.5px] leading-[1.5] text-ink-700 [text-wrap:pretty] ${
                clampable && !showAll ? 'line-clamp-4' : ''
              }`}
            >
              {description}
            </p>
            {/* 44px of target on a 12.5px word, pulled back up by its own
                overshoot so the control costs no vertical space */}
            {clampable && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="tap -mx-1 -mt-[11px] min-h-11 text-[12.5px] font-bold text-honey-800"
              >
                {showAll ? tr('common.less') : tr('common.more')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Its own band rather than another row inside the block above: links go
          somewhere else, and the honey pill is what says so. */}
      {links.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 bg-paper px-3.5 pb-3">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.url.startsWith('http') ? l.url : `https://${l.url}`}
              target="_blank"
              rel="noreferrer"
              className="tap inline-flex min-h-11 items-center gap-2 rounded-pill bg-honey-100 px-3.5 text-[12.5px] font-bold text-honey-800"
            >
              <Icon name="link" size={10} className="opacity-75" />
              {l.label}
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
