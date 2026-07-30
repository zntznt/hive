import { type HTMLAttributes, type ReactNode } from 'react'

// Two paddings and nothing between them: a row is 12px 14px, a panel is a
// flat 16px. sm and lg are kept because older screens still name them, but a
// new surface is one or the other.
const PAD = { none: '', row: 'px-3.5 py-3', sm: 'p-3.5', md: 'p-4', lg: 'p-5' }
const SHADOW = { flat: '', card: 'shadow-card', raised: 'shadow-raised' }

type Props = HTMLAttributes<HTMLDivElement> & {
  elevation?: keyof typeof SHADOW
  pad?: keyof typeof PAD
  honeycomb?: boolean
  children: ReactNode
}

export function Card({ elevation = 'card', pad = 'lg', honeycomb = false, className = '', children, ...rest }: Props) {
  return (
    <div
      className={`rounded-lg border border-line-card bg-paper ${PAD[pad]} ${SHADOW[elevation]} ${className}`}
      style={honeycomb ? { backgroundImage: 'var(--honeycomb)', backgroundColor: 'var(--cream)' } : undefined}
      {...rest}
    >
      {children}
    </div>
  )
}
