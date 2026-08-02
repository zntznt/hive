import { type HTMLAttributes, type ReactNode } from 'react'

// Two paddings and nothing between them: a row is a flat 14px, a panel is a
// flat 20px. That gap is the whole signal that tells you whether you are
// looking at a line in a list or an object in its own right, and a value
// between them erases it.
//
// It used to offer five (`none`, `row`, `sm`, `md`, `lg`) and describe two,
// and the two it described were `row` at 12px 14px and `md` at 16px, neither
// of which any screen used. What shipped was `sm` everywhere a row was meant
// and the `lg` default everywhere a panel was, so the names said size and the
// comment said kind and the two never met. The names say kind now, the values
// are the ones that were already on the screen, and the three nobody called
// are gone. Density.tsx has the tighter rows, and says why there.
const PAD = { none: '', row: 'p-3.5', panel: 'p-5' }
const SHADOW = { flat: '', card: 'shadow-card', raised: 'shadow-raised' }

type Props = HTMLAttributes<HTMLDivElement> & {
  elevation?: keyof typeof SHADOW
  pad?: keyof typeof PAD
  honeycomb?: boolean
  children: ReactNode
}

export function Card({ elevation = 'card', pad = 'panel', honeycomb = false, className = '', children, ...rest }: Props) {
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
