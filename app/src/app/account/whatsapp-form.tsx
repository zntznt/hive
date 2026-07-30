'use client'

import { useState, useTransition } from 'react'
import { startWhatsappVerification, confirmWhatsappVerification, removeWhatsappPhone } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { formatPhone } from '@/lib/phone'

// The WhatsApp number is both where notices go and a way to sign in. Because
// it is the second thing, it is not saved on sight: a code goes to the number
// first, and the account only changes when that code comes back.
export default function WhatsappForm({ phone, verifiedAt }: { phone: string | null; verifiedAt: string | null }) {
  const toast = useToast()
  const [step, setStep] = useState<'closed' | 'number' | 'code'>('closed')
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
      toast(res.enabledWhatsapp ? 'Listo, ya te avisamos por WhatsApp' : 'WhatsApp actualizado')
      close()
    })
  }

  return (
    <div className="rounded-md border border-line-card bg-paper px-3.5 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-ink-900">
          WhatsApp <span className="text-ink-500">· {phone ? formatPhone(phone) : 'no agregado'}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {/* a number saved before verification existed keeps working, but
              nobody proved it, and the badge should not say otherwise */}
          {phone && (
            <Badge tone={verifiedAt ? 'active' : 'neutral'}>{verifiedAt ? 'verificado' : 'sin verificar'}</Badge>
          )}
          <button
            type="button"
            onClick={() => (step === 'closed' ? setStep('number') : close())}
            className="tap rounded-md border-[1.5px] border-honey-500 px-2.5 py-1 text-xs font-bold text-honey-700"
          >
            {step !== 'closed' ? 'cancelar' : phone ? 'cambiar' : 'agregar'}
          </button>
        </div>
      </div>

      {step === 'number' && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-line-card pt-2.5">
          <Input
            label="Número de WhatsApp"
            placeholder="+52 55 1234 5678"
            inputMode="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-ink-300">
            Te mandamos un código para confirmar que el número es tuyo. Con él también puedes entrar a Hive.
          </p>
          {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={pending || !value.trim()} onClick={sendCode}>
              {pending ? 'Enviando…' : 'Mandar código'}
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
        <div className="mt-2.5 flex flex-col gap-2 border-t border-line-card pt-2.5">
          <Input
            label="Código de 6 dígitos"
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <p className="text-xs text-ink-300">Lo mandamos a {value.trim()}. Vence en 10 minutos.</p>
          {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={pending || code.length < 6} onClick={confirm}>
              {pending ? 'Confirmando…' : 'Confirmar'}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStep('number')}>
              Cambiar número
            </Button>
          </div>
        </div>
      )}

      {confirmRemove && (
        <Modal
          open
          onClose={() => setConfirmRemove(false)}
          title="¿Quitar tu WhatsApp?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  startTransition(async () => {
                    await removeWhatsappPhone()
                    setConfirmRemove(false)
                    close()
                    toast('WhatsApp quitado')
                  })
                }
              >
                Quitar
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-700">
            Dejas de recibir avisos por WhatsApp y ya no podrás entrar con tu número. Seguirás entrando con tu correo.
          </p>
        </Modal>
      )}
    </div>
  )
}
