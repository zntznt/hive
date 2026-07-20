'use client'

import { useState } from 'react'
import { ChevronDownIcon } from '@/components/ui/Icon'
import { updateNotificationTemplate } from '@/app/actions'

type Tpl = { channel: string; key: string; subject: string | null; body: string }

export function TemplateRow({ tplKey, email, whatsapp }: { tplKey: string; email?: Tpl; whatsapp?: Tpl }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <ChevronDownIcon className={`flex-shrink-0 text-ink-300 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="truncate font-mono text-[13.5px] font-bold text-ink-900">{tplKey}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 px-3.5 pb-3.5 pl-[31px] sm:grid-cols-2">
          {email && (
            <form action={updateNotificationTemplate.bind(null, 'email', tplKey)} className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-300">Correo</span>
              <input
                name="subject"
                defaultValue={email.subject ?? ''}
                placeholder="Asunto"
                className="rounded-sm border border-line-input bg-paper p-1.5 text-xs text-ink-900"
              />
              <textarea name="body" defaultValue={email.body} rows={4} className="rounded-sm border border-line-input bg-paper p-1.5 text-xs text-ink-900" />
              <button className="self-start text-xs font-bold text-honey-700">Guardar</button>
            </form>
          )}
          {whatsapp && (
            <form action={updateNotificationTemplate.bind(null, 'whatsapp', tplKey)} className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-300">WhatsApp (no conectado aún)</span>
              <textarea name="body" defaultValue={whatsapp.body} rows={4} className="rounded-sm border border-line-input bg-paper p-1.5 text-xs text-ink-900" />
              <button className="self-start text-xs font-bold text-honey-700">Guardar</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
