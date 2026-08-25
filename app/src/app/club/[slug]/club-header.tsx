'use client'

import { useState, type ReactNode } from 'react'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { FaceStack } from '@/components/ui/FaceStack'
import { type AvatarUser } from '@/components/ui/Avatar'
import { useT, useTf } from '@/components/ui/LangProvider'

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
  upcoming,
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
  // how many events this club still has coming, for the meta line
  upcoming: number
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
  const tf = useTf()
  const [open, setOpen] = useState(!foldedByDefault)
  // A description is a paragraph, not a field, so it is clamped rather than
  // truncated and the toggle only exists once there is something behind the
  // clamp. Under 150 characters the fourth line is the last line, and a
  // "more" that reveals nothing is worse than no control at all.
  const [showAll, setShowAll] = useState(false)
  const clampable = (description ?? '').length > 150

  const badge =
    role === 'admin' ? <Badge tone="admin">{tr('role.admin')}</Badge> : role === 'organizer' ? <Badge>{tr('role.organizer')}</Badge> : null

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

  // One card, one surface. The banner (or the honeycomb when there is none) is
  // the card's own background, and a single gradient over it carries the eye
  // from the texture down into paper, so the picture, the name and the
  // description all sit in the same object rather than on a strip with a
  // separate panel bolted underneath.
  //
  // The fade was removed once, for a real reason: at .86 by the midpoint it
  // eats a photograph and leaves muddy beige. That reason is answered by the
  // start stop, not by deleting the fade. Over the texture it opens at 0, and
  // the dissolve IS the look; over a photograph it opens at .15, so the top of
  // the image stays a picture and only the bottom third is given up to make
  // the text readable. Both cases were in the spec; only one of them was ever
  // the problem.
  const scrim = bannerUrl
    ? 'linear-gradient(180deg, rgba(251,247,239,.15) 0%, rgba(251,247,239,.88) 46%, var(--paper) 100%)'
    : 'linear-gradient(180deg, rgba(251,247,239,0) 0%, rgba(251,247,239,.86) 46%, var(--paper) 100%)'

  return (
    <section
      className="relative mb-[26px] mt-1 overflow-hidden rounded-lg border border-line-card shadow-card text-center"
      style={{
        backgroundColor: 'var(--cream)',
        backgroundImage: bannerUrl ? `url(${bannerUrl})` : 'var(--honeycomb)',
        backgroundSize: bannerUrl ? 'cover' : 'auto',
        backgroundPosition: 'center',
      }}
    >
      {cover && <div className="absolute right-[3px] top-[3px] z-chrome">{cover}</div>}
      {foldedByDefault && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="tap absolute left-2.5 top-2.5 z-chrome inline-flex min-h-11 items-center rounded-pill bg-charcoal/55 px-2.5 text-xs font-bold text-on-dark"
        >
          {tr('common.hide')}
        </button>
      )}

      <div className="px-4 pb-[14px] pt-[18px]" style={{ background: scrim }}>
        {/* Sitting in the fade rather than straddling an edge. There is no
            strip to straddle now: the texture is behind the whole card and
            this lands in the middle of where it dissolves. On a paper hex so
            it separates cleanly from whatever the cover photo is. */}
        <span className="relative mx-auto inline-grid h-[80px] w-[74px] place-items-center bg-paper [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
          {picture ?? <HexAvatar name={name} src={avatarUrl} size={68} />}
        </span>

        <span className="mt-[5px] flex flex-wrap items-center justify-center gap-2">
          <span className="font-display text-[22px] font-bold leading-[1.15] text-ink-900">{name}</span>
          {badge}
          {edit}
        </span>

        {/* The line the front door was missing. The Clubs tab drops these
            counts because its footer names the next event outright; the club's
            own page has no such footer, and this is where somebody decides
            whether they are in the right place. The middots are decoration and
            are hidden from a screen reader. */}
        <span className="mt-[3px] inline-flex flex-wrap items-center justify-center gap-[7px] text-[12.5px] text-ink-500">
          <span>{tf(total === 1 ? 'club.members1' : 'club.membersN', { n: total })}</span>
          <span aria-hidden="true">·</span>
          <span>{tf(upcoming === 1 ? 'club.upcoming1' : 'club.upcomingN', { n: upcoming })}</span>
          {role !== 'member' && (
            <>
              <span aria-hidden="true">·</span>
              <span>{tr(role === 'admin' ? 'club.youAreAdmin' : 'club.youAreOrganizer')}</span>
            </>
          )}
        </span>

        {/* Faces stay too. They are who, the line above is how many, and the
            two answer different questions. */}
        <span className="mt-1.5 flex justify-center">
          <FaceStack people={faces} total={total} size={20} max={4} />
        </span>

        {description && (
          <>
            <p
              className={`mx-auto mt-[10px] text-[13.5px] leading-[1.5] text-ink-700 [text-wrap:pretty] ${
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
