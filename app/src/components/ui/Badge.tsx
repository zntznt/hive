import { type HTMLAttributes, type ReactNode } from 'react'

const SKIN = {
  neutral: 'bg-cream-sunk text-ink-500',
  admin: 'bg-honey-100 text-honey-800',
  active: 'bg-success-bg text-success',
  pending: 'bg-warning-bg text-warning',
  // same skin as disabled, kept separate because a failed message is not a
  // deactivated thing and the call site should be able to say which it means
  danger: 'bg-danger-bg text-danger',
  disabled: 'bg-danger-bg text-danger',
}

export function Badge({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof SKIN; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-[6px] px-[7px] py-0.5 text-[11px] font-bold ${SKIN[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}
