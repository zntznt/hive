'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { useT, useTf } from '@/components/ui/LangProvider'

// The href is computed on the server and carried here. A client component
// cannot be handed a function to build one, and the URL is the filter state,
// so each option arrives already knowing where it points.
export type FilterOption = { value: string; label: string; href: string }
export type FilterGroup = {
  key: string
  // What the group is called in the sheet. The chip says the *value*, because
  // "Los Jueves" is more use on a chip than "Club".
  label: string
  options: FilterOption[]
  current: string
  // What "off" looks like for this one, so a chip only exists when it is on.
  none: string
  // Where the chip's x goes: this filter, unset.
  clearHref: string
}

// The filters for the events list.
//
// This screen used to open with six dropdowns in a 3x2 grid inside a panel,
// above a checkbox and a Filtrar button, before a single event was visible.
// Somebody who tapped Eventos to see what was coming up had to scroll past
// their own settings to reach the content, which is the loud slot spent on a
// query builder.
//
// So: the list starts at the top, and the filters are a quiet scrollable row
// of what is actually on. An unset filter is not a control sitting at zero, it
// is absent. Each chip is a link that turns itself off, and the sheet's
// options are links too, because the URL already carries the whole state and
// nothing here needs a submit button. Every other control in this app commits
// when you touch it.
//
// Six native selects at three-across in a 460px column is about 130px each,
// which truncates every club name and every place to nothing - the two filters
// most likely to be used were the two that could not show their own values.
export function EventFilters({
  groups,
  owedOnly,
  owedHref,
}: {
  groups: FilterGroup[]
  owedOnly: boolean
  // Where the money filter's toggle goes, on or off.
  owedHref: string
}) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const tf = useTf()

  // When is a switch, not a filter chip. The row was built on "an unset filter
  // is not a control sitting at zero, it is absent", which is right about club,
  // person and place: those are long lists nobody can guess. It is not right
  // about a three-way that every reader of this screen wants, and it left Past
  // two taps deep behind a sheet. The kit puts the three in the row, and the
  // agenda default only makes sense with them visible.
  const whenGroup = groups.find((g) => g.key === 'when')
  const on = groups.filter((g) => g.key !== 'when' && g.current !== g.none)
  const chipBase =
    'inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill border px-3 text-[12.5px] font-bold tap'

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]{display:none}">
        {whenGroup?.options.map((o) => {
          const active = o.value === whenGroup.current
          return (
            <Link
              key={o.value}
              href={o.href}
              aria-current={active ? 'true' : undefined}
              className={`${chipBase} ${
                active ? 'border-charcoal bg-charcoal text-on-dark' : 'border-line-card bg-paper text-ink-700'
              }`}
            >
              {o.label}
            </Link>
          )
        })}

        {/* Filters sits after the switch, not pushed to the right edge. The
            kit's row pushes it right, which works in a row that fits; this one
            scrolls horizontally and carries a chip per active filter, so
            `ml-auto` had no free space to consume and the button would drift
            further away with every chip. A fixed position is the one a thumb
            can learn. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${chipBase} border-line-card bg-paper text-ink-700`}
        >
          <Icon name="sliders" size={11} />
          {t('events.filters')}
        </button>

        {on.map((g) => {
          const label = g.options.find((o) => o.value === g.current)?.label ?? g.current
          return (
            <Link
              key={g.key}
              href={g.clearHref}
              className={`${chipBase} border-honey-500 bg-honey-100 text-honey-800`}
              aria-label={tf('events.filter.clear', { label })}
            >
              {label}
              <Icon name="xmark" size={10} />
            </Link>
          )
        })}

        {owedOnly && (
          <Link
            href={owedHref}
            className={`${chipBase} border-honey-500 bg-honey-100 text-honey-800`}
            aria-label={tf('events.filter.clear', { label: t('events.filter.owedOnly') })}
          >
            {t('events.filter.owedOnly')}
            <Icon name="xmark" size={10} />
          </Link>
        )}
      </div>

      {open && (
        <Modal open onClose={() => setOpen(false)} title={t('events.filters')}>
          <div className="flex flex-col gap-[18px]">
            {groups.map((g) => (
              <div key={g.key}>
                <span className="eyebrow mb-2 block">{g.label}</span>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => {
                    const active = o.value === g.current
                    return (
                      <Link
                        key={o.value}
                        href={o.href}
                        onClick={() => setOpen(false)}
                        aria-pressed={active}
                        className={`${chipBase} ${
                          active ? 'border-honey-500 bg-honey-100 text-honey-800' : 'border-line-card bg-paper text-ink-700'
                        }`}
                      >
                        {o.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}

            <div>
              <span className="eyebrow mb-2 block">{t('events.filter.money')}</span>
              <Link
                href={owedHref}
                onClick={() => setOpen(false)}
                aria-pressed={owedOnly}
                className={`${chipBase} ${
                  owedOnly ? 'border-honey-500 bg-honey-100 text-honey-800' : 'border-line-card bg-paper text-ink-700'
                }`}
              >
                {t('events.filter.owedOnly')}
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
