import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const PAD: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-[18px] py-[11px] text-sm',
  lg: 'px-[22px] py-3.5 text-base',
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
      className={`${block ? 'flex w-full' : 'inline-flex'} items-center justify-center gap-2 rounded-md leading-tight transition-transform duration-150 ${
        display ? 'font-display font-bold' : 'font-body font-extrabold'
      } ${PAD[size]} ${SKIN[variant]} ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} ${className}`}
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
