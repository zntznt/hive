'use client'

import { Badge } from './Badge'
import { Icon } from './Icon'
import { useLang } from './LangProvider'
import { whenPill, type When } from '@/lib/when'

export function WhenPill({
  at,
  status,
  icon = false,
  className,
}: {
  at: string | null
  status?: string | null
  icon?: boolean
  className?: string
}) {
  const lang = useLang()
  const p = whenPill(at, status, undefined, lang)
  if (!p) return null
  return (
    <Badge tone={p.tone} className={className}>
      {icon && <Icon name={p.soon ? 'clock' : 'calendar-day'} size={9.5} />}
      {p.label}
    </Badge>
  )
}
