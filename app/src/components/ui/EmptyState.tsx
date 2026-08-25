import { type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

// Empty states carry the wink; this is where the bee puns live.
export function EmptyState({
  icon = 'jar',
  title,
  hint,
  action,
  className = '',
}: {
  icon?: IconName
  title?: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-lg bg-cream-sunk px-[18px] py-[22px] text-center ${className}`}>
      <div className="mb-2 flex justify-center">
        <span className="grid h-10 w-10 place-items-center rounded-sm bg-honey-100 text-honey-800">
          <Icon name={icon} size={17} />
        </span>
      </div>
      {title && <div className="text-[13.5px] font-bold text-ink-700">{title}</div>}
      {hint && <div className="mt-0.5 text-[12.5px] text-ink-500">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
