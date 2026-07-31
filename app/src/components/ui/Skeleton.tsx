import { type CSSProperties, type HTMLAttributes } from 'react'

// First paint for a screen whose shape is already known.
//
// Every page here is a server component that makes several Supabase round
// trips before it can render anything, so there is a real wait with nothing on
// screen. A spinner would say "something is happening"; blocks at the real
// sizes in the real layout say "this is what is arriving", and nothing jumps
// when the data lands underneath them.
//
// Deliberately still. BeeLoader is the app's only sanctioned motion and it
// means "the thing you just did is running", not "this screen is on its way".
// Two kinds of movement that mean different things, both animating at once, is
// how a loading state stops reading as progress and starts reading as noise.
//
// aria-hidden throughout: a screen reader gets the real content when it
// arrives, and has nothing to say about a grey rectangle in the meantime.

export function Skeleton({
  w = '100%',
  h = 13,
  radius = 'var(--r-sm)',
  style,
  className = '',
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  w?: number | string
  h?: number | string
  radius?: string
}) {
  const s: CSSProperties = { width: w, height: h, borderRadius: radius, ...style }
  return <span aria-hidden="true" className={`block flex-shrink-0 bg-cream-sunk ${className}`} style={s} {...rest} />
}

// Shaped like the app's list card: leading tile, two stacked text lines, a
// trailing pill. Most rows in Hive are some version of this, so most skeletons
// can be this with the numbers changed.
export function SkeletonRow({
  tile = 34,
  lines = [140, 96],
  trailing = 52,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  tile?: number
  lines?: number[]
  trailing?: number
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-3 rounded-md border border-line-card bg-paper px-3.5 py-3 ${className}`}
      {...rest}
    >
      {tile ? <Skeleton w={tile} h={tile} /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-[7px]">
        {lines.map((l, i) => (
          <Skeleton key={i} w={l} h={i === 0 ? 13 : 11} />
        ))}
      </span>
      {trailing ? <Skeleton w={trailing} h={20} radius="var(--r-pill)" /> : null}
    </div>
  )
}

// The header every Page has: title, the sentence under it, and the gap the
// real PageHeader carries, so the first section lands in the same place.
export function SkeletonHeader({ lede = true, titleWidth = 168 }: { lede?: boolean; titleWidth?: number }) {
  return (
    <header aria-hidden="true" className="mb-6">
      <Skeleton w={titleWidth} h={22} />
      {lede && <Skeleton w={232} h={13} style={{ marginTop: 8 }} />}
    </header>
  )
}

// The 11px uppercase label above a group of rows.
export function SkeletonSectionHeader({ w = 104 }: { w?: number }) {
  return <Skeleton w={w} h={11} style={{ marginBottom: 10 }} />
}
