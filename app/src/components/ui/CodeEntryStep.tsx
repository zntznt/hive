'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import { useT, useTf } from '@/components/ui/LangProvider'

// The app's ONE 6-digit code input.
//
// Two places ask for a code, the sign-in hero and the account's phone row, and
// they must be the same mechanism. Both used to hand-roll their own single
// text box with a Confirm button beside it, which is two implementations of
// the one thing in the app where getting it subtly wrong locks somebody out.
//
// What must never diverge is the mechanism, which is most of the component and
// all of the risk: six boxes, one hidden autoComplete="one-time-code" input
// laid over them so the keyboard can fill it, digits that submit themselves on
// the sixth, and the ten minute expiry. What varies is only surface, scale and
// where a dead end sends you.
//
// There is no Confirm button. The sixth digit submits, so a button would mean
// the same six boxes behaving differently in two places, and that is worse
// drift than two sizes because it is invisible until your thumb is on the
// screen. The primary slot stays reserved for recovery.
//
// One deviation from the kit, and it is deliberate. The kit separates "wrong",
// "expired" and "locked", each with its own copy and an attempts-left count.
// This app answers all three with one sentence on purpose: the sign-in form is
// unauthenticated, and a distinguishable reply would turn it into a way to
// test which addresses hold an account. Behaviour is the repo's call, so the
// states here are the ones the server will actually admit to.

export type CodeStatus = 'entry' | 'submitting' | 'wrong' | 'success'

// The wrong-code red belongs in the skin like every other colour here. It was
// `border-danger`/`text-danger` regardless of surface, and on charcoal that is
// about 2.3:1: the six box borders and the sentence explaining what went wrong
// were the hardest things on the card to see, on the one screen where somebody
// is already stuck.
const SKIN = {
  dark: {
    text: 'text-on-dark',
    mute: 'text-on-dark-mute',
    box: 'bg-charcoal-2',
    border: 'border-charcoal-3',
    bad: 'text-danger-on-dark',
    badBorder: 'border-danger-on-dark',
  },
  light: {
    text: 'text-ink-900',
    mute: 'text-ink-700',
    box: 'bg-cream-sunk',
    border: 'border-line-input',
    bad: 'text-danger',
    badBorder: 'border-danger',
  },
} as const

export function CodeEntryStep({
  value,
  onChange,
  onSubmit,
  status = 'entry',
  to,
  error,
  sentAt,
  surface = 'dark',
  compact = false,
  onBack,
  backLabel,
  onResend,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (code: string) => void
  status?: CodeStatus
  // the address or number the code went to, echoed so a typo is visible here
  to?: string
  error?: string | null
  // when the code was asked for, for the countdown. Codes last ten minutes.
  sentAt?: number
  surface?: 'dark' | 'light'
  compact?: boolean
  onBack?: () => void
  backLabel?: string
  onResend?: () => void
}) {
  const tr = useT()
  const tf = useTf()
  const c = SKIN[surface]
  const digits = value.slice(0, 6).split('')
  const focusAt = digits.length
  const busy = status === 'submitting'
  const done = status === 'success'
  const submitted = useRef<string | null>(null)

  // The sixth digit submits. Guarded on the exact value so a re-render, or a
  // correction back down to five and up again, cannot fire it twice.
  useEffect(() => {
    if (value.length === 6 && !busy && !done && submitted.current !== value) {
      submitted.current = value
      onSubmit(value)
    }
    if (value.length < 6) submitted.current = null
  }, [value, busy, done, onSubmit])

  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    if (!sentAt || done) return
    // clamped at both ends: a clock that disagrees with the server would
    // otherwise count down from something absurd
    const tick = () => setLeft(Math.min(600, Math.max(0, 600 - Math.floor((Date.now() - sentAt) / 1000))))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [sentAt, done])
  const expiry = left == null ? null : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  const sentTo = tr('ui.code.sentTo').split('{to}')

  const boxH = compact ? 'h-11' : 'h-14'
  const digitSize = compact ? 'text-xl' : 'text-2xl'

  return (
    <div>
      {onBack && !done && (
        <button
          type="button"
          onClick={onBack}
          className={`tap -mx-1 -mt-3 mb-0.5 inline-flex min-h-11 items-center gap-2 px-1 text-[12.5px] font-bold ${c.mute}`}
        >
          <Icon name="arrow-left" size={12} /> {backLabel}
        </button>
      )}

      <p className={`text-[13.5px] leading-relaxed ${c.mute}`}>
        {done ? (
          tr('ui.code.entering')
        ) : to ? (
          <>
            {sentTo[0]}
            <b className={c.text}>{to}</b>
            {sentTo[1]}
          </>
        ) : (
          tr('ui.code.sent')
        )}
      </p>

      {done ? (
        <div className="mt-4 flex items-center gap-2.5 text-sm font-bold text-honey-500">
          <Icon name="circle-check" size={20} /> {tr('ui.code.accepted')}
        </div>
      ) : (
        <div className={`relative ${compact ? 'mt-3' : 'mt-4'}`}>
          <div aria-hidden="true" className={`grid grid-cols-6 ${compact ? 'gap-1.5' : 'gap-[7px]'}`}>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const on = !!digits[i]
              const here = !busy && i === focusAt
              return (
                <span
                  key={i}
                  className={`${boxH} box-border grid place-items-center rounded-md border-[1.5px] font-display font-bold ${digitSize} ${c.box} ${c.text} ${
                    status === 'wrong' ? c.badBorder : here ? 'border-honey-500' : c.border
                  } ${busy ? 'opacity-60' : ''}`}
                >
                  {on ? (
                    digits[i]
                  ) : here ? (
                    <span className={`w-0.5 rounded-sm bg-honey-500 ${compact ? 'h-5' : 'h-6'}`} />
                  ) : null}
                </span>
              )
            })}
          </div>
          {/* One hidden input over all six, so the OS can autofill the code
              from the notification in a single tap. */}
          {!busy && (
            <input
              value={value}
              onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              aria-label={tr('ui.code.label')}
              className="absolute inset-0 h-full w-full border-none bg-transparent tracking-[2em] text-transparent caret-transparent outline-none"
            />
          )}
        </div>
      )}

      <div className="mt-2.5 flex min-h-5 items-start gap-2 text-[12.5px] leading-snug">
        {status === 'wrong' && error ? (
          <>
            <span className={`mt-0.5 ${c.bad}`}>
              <Icon name="xmark" size={12} />
            </span>
            <span className={c.bad}>{error}</span>
          </>
        ) : busy ? (
          <span className={c.mute}>Revisando…</span>
        ) : !done && expiry ? (
          <>
            <span className={`mt-0.5 ${c.mute}`}>
              <Icon name="clock" size={12} />
            </span>
            <span className={c.mute}>{left === 0 ? tr('ui.code.expired') : tf('ui.code.expiresIn', { left: expiry })}</span>
          </>
        ) : null}
      </div>

      {/* The primary slot is recovery, never confirmation. */}
      {onResend && !done && (
        <div className="mt-3">
          <Button block display={!compact} size={compact ? 'md' : 'lg'} onClick={onResend}>
            {tr('ui.code.resend')}
          </Button>
        </div>
      )}
    </div>
  )
}
