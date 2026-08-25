import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

// min-h is the tap target, not the look: sm and md were 36px and 42px tall,
// both under the 44px a thumb actually needs. Padding is unchanged, so short
// labels get the height from min-h and nothing else moves.
//
// The floors are 44/46/52, the kit's. They were 44/44/52, on the reasoning
// that 44 is what a thumb needs, which is true and was never in conflict with
// 46: the kit's own ramp clears 44 at every step. At 44 the ramp collapsed to
// two heights and md stopped matching the Input it was sized against.
//
// The label sizes are the scale's, 13/14/16. Both sm and md carried `text-sm`,
// so the two differed by padding alone and a "small" button read with the same
// weight as a primary action across every call site. sm takes `--fs-sm`
// straight from the token rather than a literal, because Tailwind's own
// `text-sm` is 14px and already means body here.
const PAD: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-[length:var(--fs-sm)] min-h-11',
  md: 'px-[18px] py-[11px] text-sm min-h-[46px]',
  lg: 'px-[22px] py-3.5 text-base min-h-[52px]',
}

const SKIN: Record<Variant, string> = {
  primary: 'bg-honey-500 text-charcoal shadow-lip active:translate-y-px active:shadow-none',
  secondary: 'bg-paper text-ink-700 border-[1.5px] border-line-input',
  ghost: 'bg-transparent text-honey-700',
  danger: 'bg-danger-bg text-danger',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  display?: boolean
  block?: boolean
  icon?: ReactNode
}

// Primary = honey with a solid "candy lip" (never blurry shadow). Buttons are
// never themed with puns; copy stays plain.
export function Button({
  variant = 'primary',
  size = 'md',
  display = false,
  block = false,
  icon,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled}
      className={`${block ? 'flex w-full' : 'inline-flex'} items-center justify-center gap-2 rounded-md leading-[1.1] transition-transform duration-150 ${
        display ? 'font-display font-bold' : 'font-body font-extrabold'
      } ${PAD[size]} ${SKIN[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      {...rest}
    >
      {icon && (
        <span aria-hidden="true" className="text-[1.1em] leading-none">
          {icon}
        </span>
      )}
      {children}
    </button>
  )
}
