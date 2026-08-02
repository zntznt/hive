import { Icon, type IconName } from './Icon'
import { AVATAR_COLORS, AVATAR_FALLBACK } from '@/lib/avatar-colors'
import { tf, type Lang } from '@/lib/lang'

const HEX_CLIP = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)'

// Playful bug avatars: a hex (or rounded/circle) tile with a Font Awesome bug
// glyph. The glyph + tile color pair is how members tell each other apart at a
// glance, so the glyph has to look the same on every phone. Emoji did not:
// they are drawn by the OS, so one member's spider was a different creature
// on Android than on iPhone.
export const BUG_OPTIONS = ['bug', 'spider', 'mosquito', 'locust', 'worm'] as const
export type BugId = (typeof BUG_OPTIONS)[number]

export function BugAvatar({
  bug = 'bug',
  color = AVATAR_FALLBACK,
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

// A new member is dealt one at random rather than being the first of each
// list. Otherwise everyone who never opens this screen is an orange `bug` and
// the avatars stop telling people apart, which is the entire job.
export function randomBugAvatar() {
  const bug = BUG_OPTIONS[Math.floor(Math.random() * BUG_OPTIONS.length)]
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  return { bug: bug as string, color: color as string }
}

// Pick a bug and a colour. The preview updates live.
//
// It STACKS rather than sitting beside its preview. Side by side the tile rows
// only ever get about 250px of a 375px phone, which is what forces a hardcoded
// column count and squeezes the tiles below the glyphs they hold. Full width,
// five bugs and eight colours each get a row that reflows on its own terms
// (auto-fit + minmax), the preview can be bigger, and neither row depends on a
// column count that matches the other.
//
// `lang` is a prop rather than `useT()` because BugAvatar sits in this file
// too and server components render it. Pulling a client hook in here would
// drag the whole context into their import graph for two aria-labels.
export function BugAvatarPicker({
  bug,
  color,
  lang = 'es',
  onChange,
}: {
  bug: string
  color: string
  lang?: Lang
  onChange: (v: { bug: string; color: string }) => void
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex justify-center">
        <BugAvatar bug={bug} color={color} size={88} />
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(52px, 1fr))' }}>
        {BUG_OPTIONS.map((b) => {
          const on = b === bug
          return (
            <button
              key={b}
              type="button"
              onClick={() => onChange({ bug: b, color })}
              aria-label={tf(lang, 'avatar.bug', { name: b })}
              aria-pressed={on}
              className={`grid aspect-square min-w-0 place-items-center rounded-md p-1.5 ${
                on ? 'border-[1.5px] border-honey-500 bg-honey-100' : 'border-[1.5px] border-transparent bg-cream-sunk'
              }`}
            >
              <BugAvatar bug={b} color={color} size={34} shape="rounded" />
            </button>
          )
        })}
      </div>

      {/* A 28px circle inside a 44px button. The swatch used to be the target,
          which is 18px under the floor, and colours sit in a tight row so they
          are the easiest thing on the page to mis-tap. */}
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(36px, 1fr))' }}>
        {AVATAR_COLORS.map((c) => {
          const on = c === color
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ bug, color: c })}
              aria-label={tf(lang, 'avatar.color', { name: c })}
              aria-pressed={on}
              className="grid h-11 w-full min-w-0 place-items-center rounded-full p-0"
            >
              <span
                aria-hidden="true"
                className="h-7 w-7 rounded-full border-2 border-paper"
                style={{ background: c, outline: on ? '2px solid var(--charcoal)' : '2px solid var(--line-input)' }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
