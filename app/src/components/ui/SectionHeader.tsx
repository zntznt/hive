import { type ReactNode } from 'react'

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-2">
      <span className="eyebrow">{children}</span>
      {action}
    </div>
  )
}
