'use client'

import { Fragment, useRef, useState } from 'react'
import { updateNotifPrefs } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { NOTIF_TOPICS } from '@/lib/notif-topics'

type Matrix = Partial<Record<string, { email?: boolean; whatsapp?: boolean }>>

// Topic x channel notification matrix. Every row is a notification the
// pipeline really sends. Both columns can be on at once: each ticked channel
// queues its own outbox row. WhatsApp needs a linked number to deliver,
// otherwise the notification falls back to correo.
//
// No Save button. A tickbox that has visibly changed and has not been saved is
// the screen telling you one thing and the database holding another, and the
// gap lasts until you notice a button you had no reason to look for. Ten
// tickboxes made that ten chances to walk away having changed nothing. Each
// one commits as it is ticked.
export default function NotifPrefsForm({
  notifEmail,
  notifWhatsapp,
  prefs,
}: {
  notifEmail: boolean
  notifWhatsapp: boolean
  prefs: Matrix
}) {
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reads the whole grid off the form and sends it, whichever box was ticked.
  // updateNotifPrefs takes the full matrix, so a partial write would silently
  // clear every row it did not mention.
  async function commit() {
    const form = formRef.current
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      await updateNotifPrefs(new FormData(form))
      toast('Listo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const check = 'h-[17px] w-[17px] accent-honey-500'

  return (
    <section className="mt-[18px]">
      <SectionHeader>Notificaciones</SectionHeader>
      <form ref={formRef} onChange={commit} className="flex flex-col gap-2.5">
        <div className="grid items-center gap-x-2 gap-y-2.5" style={{ gridTemplateColumns: '1fr 52px 76px' }}>
          <span />
          <span className="text-center text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Correo</span>
          <span className="text-center text-[11px] font-extrabold uppercase tracking-wide text-ink-500">WhatsApp</span>
          {NOTIF_TOPICS.map((t) => {
            const p = prefs[t.key]
            return (
              <Fragment key={t.key}>
                <span className="text-sm text-ink-700">{t.label}</span>
                <span className="text-center">
                  <input type="checkbox" name={`t_${t.key}_email`} defaultChecked={p?.email ?? notifEmail} className={check} />
                </span>
                <span className="text-center">
                  <input type="checkbox" name={`t_${t.key}_whatsapp`} defaultChecked={p?.whatsapp ?? notifWhatsapp} className={check} />
                </span>
              </Fragment>
            )
          })}
        </div>
        <p className="text-xs text-ink-300">
          Hive no tiene bandeja propia. Todo llega a donde ya estás: correo o WhatsApp. Para recibir por WhatsApp agrega tu número arriba, en &quot;Cómo entras&quot;.
        </p>
        {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        {saving && <p className="text-xs text-ink-300">Guardando…</p>}
      </form>
    </section>
  )
}
