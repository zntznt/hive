import { Icon } from './Icon'

const HEX_CLIP = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)'

// The Hive lockup: the Font Awesome 'bugs' mark (docs/08-brand-and-tone.md, the
// founder's pick) in a honey hexagon + "Hive" in Baloo 2.
export function BrandMark({
  size = 'md',
  variant = 'lockup',
  showWordmark = true,
}: {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'lockup' | 'hex' | 'invert' | 'glyph'
  showWordmark?: boolean
}) {
  const S = { sm: 28, md: 40, lg: 52 }[size]
  const wordFont = { sm: 20, md: 28, lg: 36 }[size]
  const hex = variant === 'hex'
  const invert = variant === 'invert'
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid place-items-center"
        style={{
          width: hex ? S * 0.95 : S,
          height: S,
          fontSize: Math.round(S * 0.46),
          background: invert ? 'var(--charcoal)' : 'var(--honey-500)',
          color: invert ? 'var(--honey-500)' : 'var(--charcoal)',
          borderRadius: hex ? 0 : 'calc(var(--r-md) - 1px)',
          clipPath: hex ? HEX_CLIP : 'none',
        }}
      >
        <Icon name="bugs" size={Math.round(S * 0.5)} />
      </span>
      {showWordmark && variant !== 'glyph' && (
        <span
          className="font-display font-extrabold tracking-tight"
          style={{ fontSize: wordFont, color: invert ? 'var(--on-dark)' : 'var(--charcoal)' }}
        >
          Hive
        </span>
      )}
    </span>
  )
}
