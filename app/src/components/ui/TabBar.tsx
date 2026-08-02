'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './Icon'
import { useT } from './LangProvider'
import { type StringKey } from '@/lib/lang'

// Persistent bottom navigation: Clubs · Events · Home · Plate · You, with Home
// in the raised centre slot because it is the one screen that answers "what
// needs me" and "what is coming up" at once.
//
// The plate badge is the only badge in the app. That is the whole point of
// having no inbox: one number, and it counts things you can actually act on.
//
// Fixed to the viewport bottom on the same 460px column as page content. The
// 92px of clearance underneath belongs to the layout, not to each page, so a
// new screen cannot forget it and hide its own last row.

// The entry and interruption routes: places where the only useful action is
// the one on the screen, and where a nav bar offers five ways to leave a
// decision unmade.
const BARE = ['/i/', '/c/', '/pending', '/auth/']

// The label is a KEY, not a string. Module-level copy freezes whichever
// language rendered first, which is trap three in the design's language
// section and the reason this list holds keys and resolves them below.
type Tab = { id: string; href: string; labelKey: StringKey; icon: IconName }

const LEFT: Tab[] = [
  { id: 'clubs', href: '/clubs', labelKey: 'tab.clubs', icon: 'hashtag' },
  { id: 'events', href: '/events', labelKey: 'tab.events', icon: 'calendar-days' },
]
const RIGHT: Tab[] = [
  { id: 'plate', href: '/plate', labelKey: 'tab.plate', icon: 'list-check' },
  { id: 'account', href: '/account', labelKey: 'tab.you', icon: 'user' },
]

// A pushed screen keeps its parent tab lit: an event belongs to Events, a club
// page to Clubs. Longest prefix wins so /clubs never matches /club/[slug].
function activeId(pathname: string) {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/clubs') || pathname.startsWith('/club/')) return 'clubs'
  if (pathname.startsWith('/events') || pathname.startsWith('/e/')) return 'events'
  if (pathname.startsWith('/plate')) return 'plate'
  if (pathname.startsWith('/account')) return 'account'
  return ''
}

export function TabBar({ plateCount = 0 }: { plateCount?: number }) {
  const pathname = usePathname()
  const t = useT()
  if (BARE.some((p) => pathname.startsWith(p))) return null

  const active = activeId(pathname)
  const home = active === 'home'

  const Item = ({ tab }: { tab: Tab }) => {
    const on = active === tab.id
    return (
      <Link
        href={tab.href}
        aria-current={on ? 'page' : undefined}
        className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] px-0.5 py-1.5 ${
          on ? 'text-honey-800' : 'text-ink-500'
        }`}
      >
        <span className="relative leading-none">
          <Icon name={tab.icon} size={17} />
          {tab.id === 'plate' && plateCount > 0 && (
            <span className="absolute -top-1.5 left-[11px] box-border min-w-[15px] rounded-full border-[1.5px] border-paper bg-danger px-[3px] text-center text-[9.5px] font-extrabold leading-[15px] text-white">
              {plateCount > 9 ? '9+' : plateCount}
            </span>
          )}
        </span>
        <span className={`text-[10.5px] tracking-[.01em] ${on ? 'font-extrabold' : 'font-semibold'}`}>{t(tab.labelKey)}</span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-nav border-t border-line-card bg-paper shadow-[0_-2px_14px_rgba(43,38,32,.07)]"
    >
      <div className="mx-auto box-border flex w-full max-w-[460px] items-center px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1">
        {LEFT.map((t) => (
          <Item key={t.id} tab={t} />
        ))}
        <Link
          href="/"
          aria-label={t('tab.home')}
          aria-current={home ? 'page' : undefined}
          className={`-mt-5 mx-1.5 grid h-[54px] w-[54px] flex-shrink-0 place-items-center rounded-full border-2 border-paper ${
            home
              ? 'bg-honey-500 text-charcoal shadow-[0_4px_0_var(--honey-600),0_6px_14px_rgba(43,38,32,.2)]'
              : 'bg-charcoal text-honey-400 shadow-[0_4px_0_var(--charcoal-2),0_6px_14px_rgba(43,38,32,.2)]'
          }`}
        >
          <Icon name="house" size={21} />
        </Link>
        {RIGHT.map((t) => (
          <Item key={t.id} tab={t} />
        ))}
      </div>
    </nav>
  )
}
