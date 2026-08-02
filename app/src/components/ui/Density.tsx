import Link from 'next/link'
import { type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { UserAvatar, type AvatarUser } from './Avatar'
import { FaceStack } from './FaceStack'

// The eight density rules, as parts you can build a page out of.
//
// The problem these solve is not length, it is flatness: every section wore
// the same eyebrow and the same gap, so nothing was prioritized and the eye
// had to read the page in order to find out what it was for. Warmth alone did
// not fix it. Shape variance does, which is why these deliberately differ in
// height and in kind rather than being one row component with props.

// The surface the density rows are drawn on, written once.
//
// It is deliberately not `Card`. A Card is a 18px radius and 14px or 20px of
// padding, which is an object in its own right; these are lines in a list, so
// they take the 13px radius and sit tighter, and a run of them has to read as
// one block rather than as a stack of little panels. Two of them are also
// `<Link>`s, which Card cannot be.
//
// What was worth removing is the repetition, not the difference: the paper,
// the hairline and the radius were typed out per component, so a third row
// would have been a third guess at the same surface. The vertical padding
// stays per row and is the only thing that varies, because a summary is one
// line held open by min-h and a quote wraps to two and needs the extra pixel.
const ROW = 'rounded-md border bg-paper px-3.5'
const ROW_LINE = `${ROW} border-line-card`

// --- rule 1: one loud block per page ---------------------------------------

// The single thing on the page that answers "what do I do here" in a glance.
// One per page and never two: a second one is a claim that both are the most
// important thing, which is the flatness this is meant to end.
export function Loud({
  title,
  body,
  faces,
  children,
}: {
  title: ReactNode
  body?: ReactNode
  faces?: AvatarUser[]
  // the actions. A pair sits 1fr 1fr, one alone goes full width.
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[9px] rounded-lg border border-honey-500 bg-honey-100 p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="min-w-0 flex-1 font-display text-[17px] font-bold text-ink-900">{title}</span>
        {faces && faces.length > 0 && <FaceStack people={faces} size={25} />}
      </div>
      {body && <span className="text-[13px] leading-normal text-ink-700">{body}</span>}
      {children}
    </div>
  )
}

// --- warmth: who, not how many ---------------------------------------------

// Overlapping hex avatars. A summary that shows people instead of counting
// them, which is the difference between "6 van" and seeing that Marta is one
// of them.
// FaceStack used to live here too, with a `faces` prop and overflow counted
// from the array length, while components/ui/FaceStack.tsx counted it from
// `total`. Two components, two prop names, two overflow rules, one concept:
// the same five people rendered "+2" on the event page and "+7" everywhere
// else. The `total` one is correct, because a club usually has more members
// than the faces any one query fetched, so this one is gone.

export function QuoteLine({
  who,
  user,
  when,
  href,
  children,
}: {
  who: string
  user: AvatarUser
  when: string
  href: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={`${ROW_LINE} flex items-start gap-2.5 py-2.5`}
    >
      <UserAvatar user={user} size={24} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11.5px] text-ink-500">
          <b className="font-bold text-ink-900">{who}</b> · {when}
        </span>
        <span className="line-clamp-2 text-[13px] leading-snug text-ink-700">«{children}»</span>
      </span>
      <Icon name="chevron-right" size={10} className="mt-1.5 flex-shrink-0 text-ink-300" />
    </Link>
  )
}

// --- rules 2 and 5: expanded sections, varied shapes ------------------------

// A section that stays open. The eyebrow does the shaping a chevron used to
// do, so short content costs a scroll instead of a tap and a reflow.
export function OpenSection({
  label,
  meta,
  children,
}: {
  label: string
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2.5 px-0.5">
        <span className="eyebrow">{label}</span>
        {meta && <span className="ml-auto text-[11.5px] text-ink-300">{meta}</span>}
      </div>
      {children}
    </div>
  )
}

// A closed section, summarised in one row. `tone="hot"` is for the one that
// still wants something from you.
export function SummaryRow({
  icon,
  label,
  meta,
  href,
  arrow,
  tone,
  faces,
}: {
  icon: IconName
  label: ReactNode
  meta?: ReactNode
  href?: string
  // draws the "goes somewhere" chevron without being a link itself, for the
  // rows that open a sheet instead of navigating
  arrow?: boolean
  tone?: 'hot'
  faces?: AvatarUser[]
}) {
  const hot = tone === 'hot'
  const inner = (
    <>
      <Icon name={icon} size={13} className={`w-4 flex-shrink-0 ${hot ? 'text-honey-800' : 'text-ink-300'}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13.5px] font-bold text-ink-900">{label}</span>
        {meta && faces && faces.length > 2 && <span className="text-[11.5px] text-ink-500">{meta}</span>}
      </span>
      {faces && faces.length > 0 && <FaceStack people={faces} size={22} />}
      {meta && (!faces || faces.length <= 2) && (
        <span className={`whitespace-nowrap text-[12.5px] ${hot ? 'font-bold text-honey-800' : 'text-ink-500'}`}>
          {meta}
        </span>
      )}
      {(href || arrow) && <Icon name="chevron-right" size={10} className="flex-shrink-0 text-ink-300" />}
    </>
  )
  const cls = `${ROW} ${hot ? 'border-honey-500' : 'border-line-card'} flex min-h-[46px] items-center gap-[11px] py-2`
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

// The settled state: the loud block after you have answered it. One quiet
// line, because a decision you already made should not keep shouting.
export function QuietRow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-cream-sunk px-3.5 py-2.5 text-[13px] text-ink-700">
      <Icon name="circle-check" size={13} className="flex-shrink-0 text-sage-600" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}

// --- rule 6: no more than four identical rows in a row ----------------------

// Four muted rows each saying nothing become one line saying the same thing.
export function FoldedEmpties({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-0.5 text-[12.5px] text-ink-500">
      <Icon name="circle" size={4} className="flex-shrink-0 text-ink-300" />
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      {action}
    </div>
  )
}

// --- rule 7: doors are one labelled group under a divider -------------------

// Links to elsewhere, grouped and labelled, so they stop impersonating
// sections of this page.
export function DoorGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-[26px] flex flex-col gap-[7px] border-t border-line-card pt-[11px]">
      <span className="eyebrow px-0.5">{label}</span>
      {children}
    </div>
  )
}
