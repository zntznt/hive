'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon, type IconName } from './Icon'
import { useT } from '@/components/ui/LangProvider'

// Top bar for every screen pushed from a tab. It answers three questions at a
// glance: where am I, how do I get back, and what is the one thing to do here.
//
// One primary action, never two. Invite, usually. Everything else (edit, copy
// link, cancel, delete) lives in the overflow menu, which is where the whole
// event lifecycle now lives instead of a danger zone at the bottom of a form.

export type MenuItem = {
  label: string
  icon?: IconName
  onClick?: () => void
  href?: string
  danger?: boolean
  disabled?: boolean
}

export function AppBar({
  title,
  subtitle,
  subtitleHref,
  backHref,
  action,
  menu = [],
}: {
  title: ReactNode
  subtitle?: string
  subtitleHref?: string
  backHref?: string
  action?: { label: string; icon?: IconName; href?: string; onClick?: () => void }
  menu?: (MenuItem | false | null | undefined)[]
}) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const items = menu.filter(Boolean) as MenuItem[]

  const hit = 'grid h-11 w-11 flex-shrink-0 place-items-center rounded-md text-ink-900'

  return (
    // The bar makes its own stacking context, so an overflow menu inside it
    // could never out-rank the tab bar. While the menu is open the whole bar
    // is lifted to popover level instead.
    <div
      className={`sticky top-0 mb-4 border-b border-line-divider bg-paper ${open ? 'z-popover' : 'z-chrome'}`}
    >
      <div className="mx-auto box-border flex w-full max-w-[460px] items-center gap-1 px-1.5 py-1">
        {backHref ? (
          <Link href={backHref} aria-label="Volver" className={hit}>
            <Icon name="chevron-left" size={17} />
          </Link>
        ) : (
          <button type="button" onClick={() => router.back()} aria-label="Volver" className={hit}>
            <Icon name="chevron-left" size={17} />
          </button>
        )}

        <div className={`min-w-0 flex-1 ${backHref ? 'px-0.5' : 'px-2.5'}`}>
          <div className="truncate font-display text-[16.5px] font-bold leading-[1.2] text-ink-900">{title}</div>
          {subtitle &&
            (subtitleHref ? (
              <Link href={subtitleHref} className="block truncate text-xs font-bold leading-[1.3] text-honey-700">
                {subtitle}
              </Link>
            ) : (
              <div className="truncate text-xs font-semibold leading-[1.3] text-ink-500">{subtitle}</div>
            ))}
        </div>

        {action &&
          (action.href ? (
            <Link
              href={action.href}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-[7px] rounded-full bg-honey-500 px-[15px] text-[13px] font-extrabold text-charcoal shadow-lip"
            >
              {action.icon && <Icon name={action.icon} size={12} />}
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-[7px] rounded-full bg-honey-500 px-[15px] text-[13px] font-extrabold text-charcoal shadow-lip"
            >
              {action.icon && <Icon name={action.icon} size={12} />}
              {action.label}
            </button>
          ))}

        {items.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={tr('common.more')}
              aria-expanded={open}
              className={hit}
            >
              <Icon name="ellipsis" size={17} />
            </button>
            {open && (
              <>
                <div onClick={() => setOpen(false)} className="fixed inset-0 z-scrim" />
                <div className="absolute right-0.5 top-[calc(100%+2px)] z-popover min-w-[208px] rounded-md border border-line-card bg-paper p-[5px] shadow-pop">
                  {items.map((it) => {
                    const cls = `flex min-h-11 w-full items-center gap-[11px] rounded-sm px-2.5 text-left text-[13.5px] font-semibold ${
                      it.danger ? 'text-danger' : 'text-ink-700'
                    } ${it.disabled ? 'cursor-not-allowed opacity-45' : ''}`
                    const inner = (
                      <>
                        <Icon
                          name={it.icon ?? 'circle'}
                          size={13}
                          className={it.danger ? 'text-danger' : 'text-ink-300'}
                        />
                        {it.label}
                      </>
                    )
                    return it.href && !it.disabled ? (
                      <Link key={it.label} href={it.href} className={cls} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      <button
                        key={it.label}
                        type="button"
                        disabled={it.disabled}
                        onClick={() => {
                          setOpen(false)
                          it.onClick?.()
                        }}
                        className={cls}
                      >
                        {inner}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
