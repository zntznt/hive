'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useLang, useT } from '@/components/ui/LangProvider'
import type { StringKey } from '@/lib/lang'
import { CodeEntryStep } from '@/components/ui/CodeEntryStep'
import { Icon } from '@/components/ui/Icon'
import { parseIdentity, identityHelper, identityAction } from '@/lib/identity'
import { BrandMark } from '@/components/ui/BrandMark'
import { requestSigninCodeFor, verifySigninCodeFor } from './actions'

// One field takes either a correo or a WhatsApp number (wireframe 1). '@' is
// the only reliable tell: Mexican numbers are written with spaces, dashes,
// parentheses and an optional +52, none of which appear in an address.
function looksLikeEmail(v: string) {
  return v.includes('@')
}

// Takes the translator: this is a plain function, not a component, and a hook
// in here is a rules-of-hooks violation waiting to fire.
function humanize(raw: string, tr: (k: StringKey) => string) {
  const s = raw.toLowerCase()
  if (s.includes('expired') || s.includes('invalid') || s.includes('not found') || s === 'missing_code' || s.includes('otp'))
    return tr('signin.linkUsed')
  if (s.includes('rate') || s.includes('security purposes'))
    return tr('signin.tooMany')
  return raw
}

export default function SignIn() {
  const tr = useT()
  const lang = useLang()
  const [contact, setContact] = useState('')
  const [sent, setSent] = useState(false)
  const [sentAt, setSentAt] = useState<number | undefined>(undefined)
  const [sending, setSending] = useState(false)
  // what the field currently reads as, recomputed on every keystroke
  const id = parseIdentity(contact)
  const [error, setError] = useState<string | null>(null)
  const [viaWhatsapp, setViaWhatsapp] = useState(false)
  const [code, setCode] = useState('')

  // surface auth errors from the callback redirect (?auth_error=) and from
  // GoTrue fragment-style errors (#error_code=otp_expired…). window.location
  // isn't available during SSR, so this can't be computed during render; it's
  // a one-time sync from a non-React browser API on mount, the documented
  // exception to "don't setState in effects".
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('auth_error')
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const fromHash = hash.get('error_description') ?? hash.get('error_code')
    const msg = query ?? fromHash
    if (msg) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(humanize(msg.replace(/\+/g, ' '), tr))
      window.history.replaceState(null, '', '/')
    }
  }, [])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    const value = contact.trim()
    if (!value) return
    setSending(true)
    setError(null)

    const byEmail = looksLikeEmail(value)
    try {
      // Both channels are the same request now. The code is generated and
      // sent server-side either way, so it never touches the browser Supabase
      // client and the form does not need to know which one it asked for
      // beyond what it says on screen.
      const result = await requestSigninCodeFor(value)

      // Our own action returns a plain string; the Supabase error object this
      // used to also have to handle went with the magic link.
      if ('error' in result && result.error) {
        setError(humanize(result.error, tr))
        return
      }
      setViaWhatsapp(!byEmail)
      setSentAt(Date.now())
      setSent(true)
    } catch {
      setError(tr('signin.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  async function confirm(submitted: string) {
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const res = await verifySigninCodeFor(contact.trim(), submitted)
      if (!res.ok) {
        setError(res.error)
        setCode('')
        return
      }
      // the session cookie is already written; a full load picks it up
      window.location.assign(res.next)
    } catch {
      setError(tr('signin.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-entry flex-col justify-center px-4 pb-10 pt-6">
      {/* Dark hero card. This used to claim Tailwind's bg- and text- utilities
          beat the global `input` rule on specificity. They do not: that rule
          sat outside `@layer`, and unlayered CSS wins over any layered rule
          whatever its specificity, so this field rendered white on charcoal
          for as long as it existed. The rule is in `@layer base` now. */}
      <div className="rounded-2xl bg-charcoal px-7 py-8 shadow-pop">
        <div className="mb-6">
          <BrandMark tone="cream" />
        </div>

        {sent ? (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-on-dark">
              {viaWhatsapp ? tr('signin.checkWa') : tr('signin.checkEmail')}
            </h1>
            <>
                <CodeEntryStep
                  value={code}
                  onChange={setCode}
                  onSubmit={confirm}
                  status={sending ? 'submitting' : error ? 'wrong' : 'entry'}
                  to={contact || undefined}
                  error={error}
                  sentAt={sentAt}
                  onBack={() => {
                    setSent(false)
                    setCode('')
                    setError(null)
                  }}
                  backLabel={viaWhatsapp ? tr('signin.changeNumber') : tr('signin.changeEmail')}
                />
                {/* Load-bearing, not a courtesy. Hive has no sign-up, so a
                    contact we do not hold is sent nothing at all, and known
                    and unknown have to advance identically or this form
                    becomes a way to test which addresses have an account.
                    That puts the entire explanation here. */}
                <p className="text-xs text-on-dark-mute">
                  {viaWhatsapp
                    ? tr('signin.noAccountPhone')
                    : tr('signin.noAccountEmailLong')}
                </p>
              </>
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setCode('')
                setError(null)
              }}
              className="tap text-xs text-on-dark-mute underline"
            >
              {tr('signin.resendLong')}
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-1">
            {/* One sentence, not two halves around a <br />. The break was
                doing layout with copy: English and Spanish do not break in the
                same place, and a fragment cannot be translated on its own. The
                width does the wrapping now. */}
            <h1 className="max-w-[7em] font-display text-[30px] leading-[1.1] font-bold text-on-dark">
              {tr('signin.tagline')}
            </h1>
            <p className="mt-2 mb-5 text-sm text-on-dark-mute">{tr('signin.welcome')}</p>
            <div className="mb-2 flex flex-col gap-1.5">
              <label className="text-[12.5px] font-semibold text-on-dark-mute" htmlFor="contact">
                {tr('signin.field')}
              </label>
              <input
                id="contact"
                type="text"
                // follows what they are typing, so a number gets the number pad
                inputMode={id.kind === 'phone' || id.kind === 'short' ? 'tel' : 'email'}
                autoComplete="username"
                required
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={tr('signin.ph')}
                className={`min-h-[46px] rounded-md border-[1.5px] bg-charcoal-2 px-[14px] py-[13px] text-sm text-on-dark outline-none placeholder:text-on-dark-mute ${
                  error ? 'border-danger' : contact.trim() ? 'border-honey-500' : 'border-charcoal-3'
                }`}
              />
            </div>

            {/* Which channel this is about to use, while they can still change
                it. For a number it prints the normalized form, so the +52
                nobody typed is visible before they commit rather than after
                the message has gone somewhere else. Errors are answered on
                submit, never while typing. */}
            <div
              className={`mb-3 flex min-h-[34px] items-start gap-2 text-xs leading-snug ${
                error ? 'text-danger' : 'text-on-dark-mute'
              }`}
            >
              {error ? (
                <span className="mt-0.5 flex-shrink-0">
                  <Icon name="xmark" size={12} />
                </span>
              ) : id.kind === 'email' ? (
                <span className="mt-0.5 flex-shrink-0 text-honey-400">
                  <Icon name="envelope" size={12} />
                </span>
              ) : id.kind === 'phone' ? (
                <span className="mt-0.5 flex-shrink-0 text-honey-400">
                  <Icon name="whatsapp" size={13} />
                </span>
              ) : null}
              <span>{error ?? identityHelper(id, lang)}</span>
            </div>

            {/* Never inert on a non-empty field: on a field that takes two
                kinds of value, a dead button cannot tell you whether you typed
                too few digits or the wrong kind of thing, so the submit is
                accepted and answered in words. */}
            <Button display block size="lg" disabled={sending || id.kind === 'empty'}>
              {sending ? tr('signin.sending') : identityAction(id, lang)}
            </Button>
            <p className="mt-4 text-center text-xs text-on-dark-mute">{tr('signin.noPasswords')}</p>
          </form>
        )}
      </div>
      <p className="mt-3.5 text-center text-[11.5px] text-ink-300">
        {tr('signin.invited')}
      </p>
    </main>
  )
}
