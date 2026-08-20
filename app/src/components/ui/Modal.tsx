'use client'

import { useT } from './LangProvider'

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

// Centered dialog on a dimmed backdrop. Closes on backdrop click or Escape.
// Titles & buttons stay literal; modals are workflow, not wink.
//
// It renders into document.body, and that is load-bearing rather than tidy.
//
// A modal used to render where it was opened from, and the club header opens
// one from inside `overflow-hidden` (the section clips the honeycomb cover to
// its rounded corners). A clip applies to a fixed child too, and z-index
// cannot escape a clip: the dialog painted fine, but everything below the
// section's bottom edge stopped taking taps, and what took them instead was
// the tab bar underneath. On a 390x844 phone that is the bottom 33px of the
// confirm button, so framing a club photo and pressing "Usar foto" opened the
// Pendientes tab and the photo was never applied.
//
// globals.css states the general rule next to the layer scale: a popover
// inside an overflow:hidden card has to be positioned in viewport space
// rather than given a bigger number. This is that, applied once here so no
// caller has to know where it is mounted.

// Whether we are on the client never changes after the first render, so there
// is nothing to subscribe to. Module scope so the reference is stable and the
// store is not resubscribed on every render.
const subscribeNothing = () => () => {}
export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  footer,
  width = 440,
  children,
}: {
  open?: boolean
  onClose?: () => void
  title: ReactNode
  subtitle?: ReactNode
  footer?: ReactNode
  width?: number
  children: ReactNode
}) {
  const tr = useT()
  // document does not exist on the server, and a modal is opened by a tap, so
  // there is nothing to portal into on the first pass anyway.
  //
  // useSyncExternalStore rather than setState in an effect: it reads false
  // from the server snapshot and true from the client one, in one render,
  // where the effect form sets state during the effect and lints as a
  // cascading render.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      className="fixed inset-0 z-modal flex items-end justify-center overflow-y-auto p-4 backdrop-blur-[3px] sm:items-center"
      style={{ background: 'rgba(43,38,32,.45)' }}
    >
      <div
        // text-left is kept although the portal now makes it unnecessary. It
        // was added because a modal opened from the club header, which is
        // `text-center`, came up with its form labels centred. Stating the
        // alignment a dialog wants costs nothing and does not depend on where
        // this ends up mounted.
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-paper text-left shadow-pop"
        style={{ maxWidth: width, animation: 'hive-pop .18s var(--ease)' }}
      >
        <div className="flex items-start justify-between gap-3 px-[22px] pb-3 pt-5">
          <div>
            <div className="font-display text-xl font-bold text-ink-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-500">{subtitle}</div>}
          </div>
          {/* 44px of target around a 32px tile, not a 32px tile stretched
              to 44. `.tap` sets a min-height, and this control paints its
              background on the same element, so the sunk square became a
              visible capsule and set a 44px floor on every modal header.
              Same shape ChipButton uses: the wrapper is the target, the span
              is the thing you see, and the negative margin gives the height
              back to the row. */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('common.close')}
              className="-my-1.5 grid min-h-11 w-11 flex-shrink-0 cursor-pointer place-items-center"
            >
              <span className="grid h-8 w-8 place-items-center rounded-sm bg-cream-sunk text-ink-500">
                <Icon name="xmark" size={16} />
              </span>
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-[22px] pb-5 pt-1">{children}</div>
        {footer && (
          <div className="grid grid-flow-col auto-cols-fr gap-2.5 border-t border-line-divider bg-paper px-[22px] py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
