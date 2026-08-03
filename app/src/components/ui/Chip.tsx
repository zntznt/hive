import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'

const SKIN = {
  neutral: 'bg-cream-sunk text-ink-700',
  honey: 'bg-honey-100 text-honey-800',
  sage: 'bg-sage-100 text-sage-600',
  solid: 'bg-honey-500 text-charcoal',
}

type ChipStyle = {
  variant?: keyof typeof SKIN
  active?: boolean
  className?: string
}
type Props = ChipStyle & { children: ReactNode }

function chipClass({ variant = 'neutral', active = false, className = '' }: ChipStyle) {
  const skin = active ? 'bg-honey-100 text-honey-800 border-[1.5px] border-honey-500' : `${SKIN[variant]} border-[1.5px] border-transparent`
  return `inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-[3px] text-[11px] font-bold leading-relaxed ${skin} ${className}`
}

export function Chip({ variant, active, className, children, ...rest }: Props & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={chipClass({ variant, active, className })} {...rest}>
      {children}
    </span>
  )
}

// A chip is ~22px tall by design (it is a label first), so the tappable one
// keeps its size and borrows the area it is missing.
//
// It borrows it from a wrapper, not from itself. `.tap` on the chip made the
// chip 44px, so "+ Categoría" stood twice as tall as every category beside it
// and the row it sits in reads as two different kinds of thing. The target is
// a 44px button around a chip-sized span, and the negative margin gives the
// height back to the layout so the row does not grow either.
export function ChipButton({
  variant,
  active,
  className,
  children,
  ...rest
}: Props & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="-my-[10px] inline-flex min-h-11 cursor-pointer items-center" {...rest}>
      <span className={chipClass({ variant, active, className })}>{children}</span>
    </button>
  )
}
