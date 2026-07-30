'use client'

import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

// Centered dialog on a dimmed backdrop. Closes on backdrop click or Escape.
// Titles & buttons stay literal; modals are workflow, not wink.
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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      className="fixed inset-0 z-modal flex items-end justify-center overflow-y-auto p-4 backdrop-blur-[3px] sm:items-center"
      style={{ background: 'rgba(43,38,32,.45)' }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-paper shadow-pop"
        style={{ maxWidth: width, animation: 'hive-pop .18s var(--ease)' }}
      >
        <div className="flex items-start justify-between gap-3 px-[22px] pb-3 pt-5">
          <div>
            <div className="font-display text-xl font-bold text-ink-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-500">{subtitle}</div>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="tap grid h-8 w-8 flex-shrink-0 place-items-center rounded-sm bg-cream-sunk text-base leading-none text-ink-500"
            >
              <Icon name="xmark" size={12} />
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-[22px] pb-5 pt-1">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2.5 border-t border-line-divider bg-paper px-[22px] py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
