'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

// Google takes a URL, everything else takes a file. Apple, Outlook and the
// stock Android calendars all read .ics, so one download covers them without
// a button each.
//
// There is deliberately no "added" state. We hand the event to the calendar
// and never hear back, so claiming it landed would be the app asserting
// something it cannot know.

function gcal(e: { title: string; start: string; end: string; details: string; location: string | null }) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${fmt(e.start)}/${fmt(e.end)}`,
    details: e.details,
    ...(e.location ? { location: e.location } : {}),
  })
  return `https://calendar.google.com/calendar/render?${p}`
}

export default function AddToCalendar({
  slug,
  title,
  startIso,
  endIso,
  location,
  clubName,
  eventUrl,
}: {
  slug: string
  title: string
  startIso: string
  endIso: string | null
  location: string | null
  clubName: string | null
  // built on the server, where the canonical origin already lives, rather
  // than read off window and differing between render and hydration
  eventUrl: string
}) {
  const [open, setOpen] = useState(false)
  const end = endIso ?? new Date(new Date(startIso).getTime() + 3 * 3600_000).toISOString()
  const details = [clubName, eventUrl].filter(Boolean).join(' · ')

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-line-input bg-paper px-3.5 text-[13px] font-bold text-ink-700"
      >
        <Icon name="calendar-plus" size={13} className="text-honey-700" />
        Agregar a tu calendario
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-scrim" />
          <div className="absolute left-0 top-[calc(100%+4px)] z-popover min-w-[228px] rounded-md border border-line-card bg-paper p-[5px] shadow-pop">
            <a
              href={gcal({ title, start: startIso, end, details, location })}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center gap-[11px] rounded-sm px-2.5 text-[13.5px] font-semibold text-ink-700"
            >
              <Icon name="google" size={13} className="text-ink-300" />
              Google Calendar
            </a>
            <a
              href={`/e/${slug}/calendar.ics`}
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center gap-[11px] rounded-sm px-2.5 text-[13.5px] font-semibold text-ink-700"
            >
              <Icon name="apple" size={13} className="text-ink-300" />
              Apple, Outlook y otros
            </a>
          </div>
        </>
      )}
    </div>
  )
}
