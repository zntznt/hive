import Link from 'next/link'
import { type ReactNode } from 'react'

const TONES = {
  honey: 'bg-honey-100 text-honey-800',
  sage: 'bg-sage-100 text-sage-600',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-cream-sunk text-ink-500',
}

// A single actionable row for the member's dashboard ("on your plate"): an
// icon tile, a title + event link, and an action slot on the right (a form
// button, a Link, or nothing for a purely informational row).
export function PlateItemRow({
  emoji,
  tone = 'honey',
  title,
  eventTitle,
  eventHref,
  note,
  action,
}: {
  emoji: string
  tone?: keyof typeof TONES
  title: ReactNode
  eventTitle?: string
  eventHref?: string
  note?: string
  action?: ReactNode
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-md border border-line-card bg-paper px-[13px] py-[11px]">
      <span className={`grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-sm text-base ${TONES[tone]}`} aria-hidden="true">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink-900">{title}</span>
        <span className="text-[12.5px] text-ink-500">
          {eventTitle && eventHref ? (
            <Link href={eventHref} className="font-bold text-honey-700">
              {eventTitle}
            </Link>
          ) : (
            eventTitle
          )}
          {note ? ` · ${note}` : ''}
        </span>
      </span>
      {action && <span className="flex-shrink-0 text-[12.5px] font-bold text-honey-700">{action}</span>}
    </div>
  )
}
