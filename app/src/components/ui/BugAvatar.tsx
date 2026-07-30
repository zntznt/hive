import { Icon, type IconName } from './Icon'

const HEX_CLIP = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)'

// Playful bug avatars: a hex (or rounded/circle) tile with a Font Awesome bug
// glyph. The glyph + tile color pair is how members tell each other apart at a
// glance, so the glyph has to look the same on every phone. Emoji did not:
// they are drawn by the OS, so one member's spider was a different creature
// on Android than on iPhone.
export const BUG_OPTIONS = ['bug', 'spider', 'mosquito', 'locust', 'worm'] as const
export type BugId = (typeof BUG_OPTIONS)[number]
export const BUG_COLORS = ['#EBA937', '#F2B84A', '#FFD27A', '#9BAF7E', '#7FA3A0', '#E08A5B', '#C98BB0', '#8AA0D9']

export function BugAvatar({
  bug = 'bug',
  color = '#EBA937',
  size = 44,
  shape = 'hex',
  className = '',
}: {
  bug?: string
  color?: string
  size?: number
  shape?: 'hex' | 'rounded' | 'circle'
  className?: string
}) {
  const hex = shape === 'hex'
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center ${!hex ? (shape === 'circle' ? 'rounded-full' : 'rounded-[calc(var(--r-md)-1px)]') : ''} ${className}`}
      style={{
        width: hex ? size * 0.92 : size,
        height: size,
        background: color,
        clipPath: hex ? HEX_CLIP : 'none',
        color: 'var(--charcoal)',
      }}
    >
      <Icon name={(BUG_OPTIONS as readonly string[]).includes(bug) ? (bug as IconName) : 'bug'} size={Math.round(size * 0.46)} />
    </span>
  )
}

export function BugAvatarPicker({
  bug,
  color,
  onChange,
}: {
  bug: string
  color: string
  onChange: (v: { bug: string; color: string }) => void
}) {
  return (
    <div className="flex items-start gap-[18px]">
      <div className="flex-shrink-0 text-center">
        <BugAvatar bug={bug} color={color} size={76} />
        <div className="mt-1.5 text-[11px] text-ink-300">Tú</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-5 gap-2">
          {BUG_OPTIONS.map((b) => {
            const on = b === bug
            return (
              <button
                key={b}
                type="button"
                onClick={() => onChange({ bug: b, color })}
                aria-label={`bug ${b}`}
                className={`grid aspect-square place-items-center rounded-md p-1 ${
                  on ? 'border-[1.5px] border-honey-500 bg-honey-100' : 'border-[1.5px] border-transparent bg-cream-sunk'
                }`}
              >
                <BugAvatar bug={b} color={color} size={34} shape="rounded" />
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BUG_COLORS.map((c) => {
            const on = c === color
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ bug, color: c })}
                aria-label={`color ${c}`}
                className="tap h-[26px] w-[26px] rounded-full border-2 border-paper"
                style={{ background: c, outline: on ? '2px solid var(--charcoal)' : '2px solid var(--border-input)' }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
