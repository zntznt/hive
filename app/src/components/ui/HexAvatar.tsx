const PALETTE = ['#EBA937', '#F2B84A', '#9BAF7E', '#E08A5B', '#C9944A', '#7FA3A0']
const HEX_CLIP = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)'

function paletteFor(name: string) {
  const sum = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return PALETTE[sum % PALETTE.length]
}

// Initials-in-a-hexagon (or clipped photo). Used for clubs and as the
// photo-avatar fallback for members.
export function HexAvatar({
  name = '?',
  size = 40,
  color,
  src,
  className = '',
}: {
  name?: string
  size?: number
  color?: string
  src?: string | null
  className?: string
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const bg = color || paletteFor(name)
  const style = { width: size * 0.92, height: size, clipPath: HEX_CLIP }
  if (src) {
    return (
      <span title={name} className={`block ${className}`} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className="block h-full w-full object-cover" />
      </span>
    )
  }
  return (
    <span
      title={name}
      className={`grid place-items-center font-display font-extrabold text-charcoal ${className}`}
      style={{ ...style, background: bg, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  )
}
