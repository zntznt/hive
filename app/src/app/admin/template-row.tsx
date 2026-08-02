'use client'

import { useState } from 'react'
import { ChevronDownIcon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'
import { updateNotificationTemplate, submitWhatsappTemplate, refreshWhatsappTemplates } from '@/app/actions'
import { useT } from '@/components/ui/LangProvider'
import type { StringKey } from '@/lib/lang'

type Tpl = {
  channel: string
  key: string
  subject: string | null
  body: string
  wa_status?: string | null
  wa_vars?: string[] | null
  wa_error?: string | null
}

// Keys, not sentences: this is module-level, and copy in a module-level const
// freezes whichever language loaded first.
const WA_LABEL: Record<string, { key: StringKey; tone: 'active' | 'pending' | 'disabled' }> = {
  pending: { key: 'admin.tpl.review', tone: 'pending' },
  approved: { key: 'admin.tpl.approved', tone: 'active' },
  rejected: { key: 'admin.tpl.rejected', tone: 'disabled' },
  paused: { key: 'admin.tpl.paused', tone: 'disabled' },
  disabled: { key: 'admin.tpl.disabled', tone: 'disabled' },
}

// Meta reviews asynchronously, so nothing here changes status on its own.
export function TemplateSyncBar() {
  const tr = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="mb-2 flex items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await refreshWhatsappTemplates()
          } catch (e) {
            setError(e instanceof Error ? e.message : tr('common.notUpdated'))
          } finally {
            setBusy(false)
          }
        }}
        className="tap text-xs font-bold text-honey-700 disabled:opacity-50"
      >
        {busy ? 'Actualizando…' : 'Actualizar estados de WhatsApp'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}

export function TemplateRow({ tplKey, email, whatsapp }: { tplKey: string; email?: Tpl; whatsapp?: Tpl }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = whatsapp?.wa_status ?? null
  const badge = status ? WA_LABEL[status] : null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-h-11 flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <ChevronDownIcon className={`flex-shrink-0 text-ink-300 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="truncate font-mono text-[13.5px] font-bold text-ink-900">{tplKey}</span>
        {whatsapp && (
          <span className="ml-auto flex-shrink-0">
            {badge ? (
              <Badge tone={badge.tone}>{tr(badge.key)}</Badge>
            ) : (
              <span className="text-[11px] font-bold text-ink-300">{tr('admin.tpl.noWa')}</span>
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 px-3.5 pb-3.5 pl-[31px] sm:grid-cols-2">
          {email && (
            <form action={updateNotificationTemplate.bind(null, 'email', tplKey)} className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-300">{tr('notif.email')}</span>
              <input
                name="subject"
                defaultValue={email.subject ?? ''}
                placeholder={tr('admin.tpl.subject')}
                className="rounded-sm border border-line-input bg-paper p-1.5 text-xs text-ink-900"
              />
              <textarea name="body" defaultValue={email.body} rows={4} className="rounded-sm border border-line-input bg-paper p-1.5 text-xs text-ink-900" />
              <button className="tap self-start text-xs font-bold text-honey-700">{tr('common.save')}</button>
            </form>
          )}
          {whatsapp && (
            <div className="flex flex-col gap-1.5">
              <form action={updateNotificationTemplate.bind(null, 'whatsapp', tplKey)} className="flex flex-col gap-1.5">
                <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-300">{tr('notif.whatsapp')}</span>
                <textarea name="body" defaultValue={whatsapp.body} rows={4} className="rounded-sm border border-line-input bg-paper p-1.5 text-xs text-ink-900" />
                <button className="tap self-start text-xs font-bold text-honey-700">{tr('common.save')}</button>
              </form>

              <p className="text-[11px] leading-snug text-ink-300">
                Guardar solo cambia el texto en Hive. WhatsApp sigue enviando la última versión aprobada, así que
                mándala a revisión cuando la cambies. Meta tarda de unas horas a un par de días.
              </p>

              {whatsapp.wa_vars && whatsapp.wa_vars.length > 0 && (
                <p className="font-mono text-[11px] text-ink-500">orden: {whatsapp.wa_vars.join(' · ')}</p>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await submitWhatsappTemplate(tplKey)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : tr('common.notSent'))
                  } finally {
                    setBusy(false)
                  }
                }}
                className="tap self-start text-xs font-bold text-honey-700 disabled:opacity-50"
              >
                {busy ? 'Enviando…' : status ? tr('admin.tpl.resend') : tr('admin.tpl.send')}
              </button>

              {(error || whatsapp.wa_error) && (
                <p className="rounded-sm bg-danger-bg p-2 text-[11px] text-danger">{error ?? whatsapp.wa_error}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
