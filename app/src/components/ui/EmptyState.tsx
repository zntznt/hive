import { type ReactNode } from 'react'

// Empty states carry the wink; this is where the bee puns live.
export function EmptyState({
  emoji = '🐝',
  title,
  hint,
  action,
  className = '',
}: {
  emoji?: string
  title?: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-lg bg-cream-sunk px-[18px] py-[22px] text-center ${className}`}>
      <div className="mb-1.5 text-[28px] leading-none" aria-hidden="true">
        {emoji}
      </div>
      {title && <div className="text-[13.5px] font-bold text-ink-700">{title}</div>}
      {hint && <div className="mt-0.5 text-[12.5px] text-ink-500">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
