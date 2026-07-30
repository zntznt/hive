import { type ReactNode } from 'react'

// The rhythm every tab shares.
//
// The five main screens each invented their own: p-6 or px-6, max-w-md on four
// of them and max-w-lg on the fifth, a header margin of 24, 28 or 4px, and
// sections that all sat exactly 24px apart whether the next one was a
// continuation or a change of subject. Uniform spacing is not neutral, it is
// flat: when every gap is the same size, nothing on the page is grouped with
// anything, and the eye has to read in order to find out what belongs
// together.
//
// So there are two gaps, not one. `Section` is 28px from what came before,
// which is a new subject. `Section tight` is 18px, which is more of the same
// subject. Everything else here is just the shell those two live in.

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  // no extra room for the tab bar here: the layout already reserves it
  return <main className={`mx-auto w-full max-w-md px-6 pb-6 pt-5 ${className}`}>{children}</main>
}

// Title, the sentence under it, and at most one action. The lede is where a
// screen gets to say what it is for, so it sits with the title rather than
// floating above the first section as its own paragraph.
export function PageHeader({
  title,
  lede,
  action,
  children,
}: {
  title: ReactNode
  lede?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-xl font-bold leading-tight text-ink-900">{title}</h1>
        {action}
      </div>
      {lede && <p className="mt-1 text-[13px] leading-snug text-ink-500">{lede}</p>}
      {children}
    </header>
  )
}

export function Section({
  tight = false,
  first = false,
  className = '',
  children,
}: {
  // more of the same subject as the section above it
  tight?: boolean
  // sits directly under the header, which already carries the gap
  first?: boolean
  className?: string
  children: ReactNode
}) {
  const top = first ? '' : tight ? 'mt-[18px]' : 'mt-7'
  return <section className={`${top} ${className}`}>{children}</section>
}
