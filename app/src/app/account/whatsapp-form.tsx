'use client'

import { useState, useTransition } from 'react'
import { startWhatsappVerification, confirmWhatsappVerification, removeWhatsappPhone } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { CodeEntryStep } from '@/components/ui/CodeEntryStep'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useT } from '@/components/ui/LangProvider'
import { formatPhone } from '@/lib/phone'

// The WhatsApp number is both where notices go and a way to sign in. Because
// it is the second thing, it is not saved on sight: a code goes to the number
// first, and the account only changes when that code comes back.
export default function WhatsappForm({ phone, verifiedAt }: { phone: string | null; verifiedAt: string | null }) {
  const tr = useT()
  const toast = useToast()
  const [step, setStep] = useState<'closed' | 'number' | 'code'>('closed')
  const [sentAt, setSentAt] = useState<number | undefined>(undefined)
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [pending, startTransition] = useTransition()

  function close() {
    setStep('closed')
    setValue('')
    setCode('')
    setError(null)
  }

  function sendCode() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('phone', value.trim())
      const res = await startWhatsappVerification(fd)
      if (!res.ok) return setError(res.error)
      setSentAt(Date.now())
      setStep('code')
    })
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const res = await confirmWhatsappVerification(code.trim())
      if (!res.ok) {
        setError(res.error)
        setCode('')
        return
      }
      toast(tr(res.enabledWhatsapp ? 'account.wa.done' : 'account.wa.updated'))
      close()
    })
  }

  return (
    <div className="rounded-md border border-line-card bg-paper px-3.5 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-ink-900">
          WhatsApp <span className="text-ink-500">· {phone ? formatPhone(phone) : tr('account.wa.notAdded')}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {/* a number saved before verification existed keeps working, but
              nobody proved it, and the badge should not say otherwise */}
          {phone && (
            <Badge tone={verifiedAt ? 'active' : 'neutral'}>{tr(verifiedAt ? 'account.wa.verified' : 'account.wa.unverified')}</Badge>
          )}
          <button
            type="button"
            onClick={() => (step === 'closed' ? setStep('number') : close())}
            className="tap rounded-md border-[1.5px] border-honey-500 px-2.5 py-1 text-xs font-bold text-honey-700"
          >
            {step !== 'closed' ? tr('common.cancel') : phone ? tr('common.change') : tr('account.wa.add')}
          </button>
        </div>
      </div>

      {step === 'number' && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-line-card pt-2.5">
          <Input
            label={tr('account.wa.number')}
            placeholder={tr('account.wa.ph')}
            inputMode="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-ink-300">
            {tr('account.wa.codeHint')}
          </p>
          {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={pending || !value.trim()} onClick={sendCode}>
              {pending ? tr('common.sending') : tr('account.wa.send')}
            </Button>
            {phone && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmRemove(true)}>
                Quitar
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'code' && (
        <div className="mt-2.5 border-t border-line-card pt-2.5">
          {/* Same six boxes as the sign-in hero, in the light compact skin.
              This row used to roll its own input and its own Confirm button,
              which is exactly the second code entry the kit forbids. */}
          <CodeEntryStep
            value={code}
            onChange={setCode}
            onSubmit={confirm}
            status={pending ? 'submitting' : error ? 'wrong' : 'entry'}
            to={value.trim()}
            error={error}
            sentAt={sentAt}
            surface="light"
            compact
            onBack={() => setStep('number')}
            backLabel={tr('account.wa.change')}
          />
        </div>
      )}

      {confirmRemove && (
        <Modal
          open
          onClose={() => setConfirmRemove(false)}
          title={tr('account.wa.remove')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                {tr('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  startTransition(async () => {
                    await removeWhatsappPhone()
                    setConfirmRemove(false)
                    close()
                    toast(tr('account.wa.removed'))
                  })
                }
              >
                Quitar
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-700">
            {tr('account.wa.removeHint')}
          </p>
        </Modal>
      )}
    </div>
  )
}
